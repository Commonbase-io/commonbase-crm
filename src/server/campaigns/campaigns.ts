import "server-only";
import { z } from "zod";
import type { TenantContext } from "@/server/auth/tenant-context";
import { assertCan } from "@/server/auth/roles";
import { audit, type AuditScope } from "@/server/audit";
import { syncOptOuts } from "@/server/compliance/opt-out-sync";
import { redactString } from "@/server/compliance/redact";
import { checkCampaignCompliance, type ComplianceProblem } from "@/server/compliance/template-check";
import type { ProviderAdapters } from "@/server/providers/interfaces";
import { getProviderRegistry } from "@/server/providers/server-registry";
import { createAdminClient } from "@/server/supabase/admin";
import { createUserClient } from "@/server/supabase/server";
import { planEnrollment, providerContactId, type EnrollmentCandidate, type ExistingStatus } from "./enrollment-plan";
import { runIdempotent } from "./idempotency";
import { supabaseIdempotencyStore } from "./idempotency-store";
import { assertTransition, ENROLLABLE, isCampaignStatus, type CampaignStatus } from "./state";

// Reads and draft edits run as the signed-in user (RLS: managers and admins
// edit drafts only). Status changes and enrollment use the service role,
// because the authenticated role cannot write them; every such call first
// checks the user's permission and filters by ctx.tenantId.

export class CampaignNotFoundError extends Error {
  constructor() {
    super("Campaign not found");
    this.name = "CampaignNotFoundError";
  }
}

export class CampaignComplianceError extends Error {
  constructor(readonly problems: ComplianceProblem[]) {
    super("Campaign failed the compliance check");
    this.name = "CampaignComplianceError";
  }
}

export class CampaignStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CampaignStateError";
  }
}

type UserClient = Awaited<ReturnType<typeof createUserClient>>;
type AdminClient = ReturnType<typeof createAdminClient>;
/** Tenant (and acting user, if any). Used by helpers that background jobs share. */
type Scope = AuditScope;

const errorText = (error: unknown) => redactString(error instanceof Error ? error.message : "Unknown error").slice(0, 500);

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export interface CampaignSummary {
  id: string;
  name: string;
  status: CampaignStatus;
  mailboxEmail: string | null;
  enrolled: number;
  approvedAt: string | null;
  updatedAt: string;
}

export async function listCampaigns(ctx: TenantContext): Promise<CampaignSummary[]> {
  assertCan(ctx.role, "crm.read");
  const supabase = await createUserClient();
  const [campaigns, enrollments] = await Promise.all([
    supabase
      .from("campaigns")
      .select("id, name, status, approved_at, updated_at, mailbox:mailboxes!campaigns_tenant_id_provider_connection_id_mailbox_id_fkey(email)")
      .eq("tenant_id", ctx.tenantId)
      .order("updated_at", { ascending: false }),
    supabase.from("campaign_contacts").select("campaign_id").eq("tenant_id", ctx.tenantId).eq("enrollment_status", "enrolled"),
  ]);
  if (campaigns.error || enrollments.error) throw new Error("Failed to load campaigns");
  const counts = new Map<string, number>();
  for (const row of enrollments.data) counts.set(row.campaign_id, (counts.get(row.campaign_id) ?? 0) + 1);
  return campaigns.data.map((c) => {
    const mailbox = Array.isArray(c.mailbox) ? c.mailbox[0] : c.mailbox;
    return {
      id: c.id,
      name: c.name,
      status: isCampaignStatus(c.status) ? c.status : "draft",
      mailboxEmail: mailbox?.email ?? null,
      enrolled: counts.get(c.id) ?? 0,
      approvedAt: c.approved_at,
      updatedAt: c.updated_at,
    };
  });
}

async function loadCampaignRow(supabase: UserClient | AdminClient, ctx: Scope, campaignId: string) {
  const { data, error } = await supabase
    .from("campaigns")
    .select("id, name, status, mailbox_id, provider_connection_id, external_id, approved_by, approved_at, last_error, updated_at")
    .eq("tenant_id", ctx.tenantId)
    .eq("id", campaignId)
    .maybeSingle();
  if (error) throw new Error("Failed to load campaign");
  if (!data || !isCampaignStatus(data.status)) throw new CampaignNotFoundError();
  return { ...data, status: data.status as CampaignStatus };
}

async function loadSteps(supabase: UserClient, ctx: TenantContext, campaignId: string) {
  const { data, error } = await supabase
    .from("sequence_steps")
    .select("id, position, step_type, delay_days, subject, body")
    .eq("tenant_id", ctx.tenantId)
    .eq("campaign_id", campaignId)
    .order("position");
  if (error) throw new Error("Failed to load steps");
  return data.map((s) => ({
    id: s.id,
    position: s.position,
    stepType: (s.step_type === "task" ? "task" : "email") as "email" | "task",
    delayDays: s.delay_days,
    subject: s.subject,
    body: s.body,
  }));
}

async function loadPostalAddress(supabase: UserClient, ctx: TenantContext) {
  const { data, error } = await supabase.from("tenants").select("postal_address").eq("id", ctx.tenantId).single();
  if (error) throw new Error("Failed to load tenant");
  return data.postal_address;
}

export async function loadCampaign(ctx: TenantContext, campaignId: string) {
  assertCan(ctx.role, "crm.read");
  const supabase = await createUserClient();
  const campaign = await loadCampaignRow(supabase, ctx, campaignId);
  const [steps, postalAddress, mailboxes, enrollments, approver, connection] = await Promise.all([
    loadSteps(supabase, ctx, campaignId),
    loadPostalAddress(supabase, ctx),
    supabase
      .from("mailboxes")
      .select("id, email, status, daily_limit")
      .eq("tenant_id", ctx.tenantId)
      .eq("provider_connection_id", campaign.provider_connection_id)
      .order("email"),
    supabase
      .from("campaign_contacts")
      .select("contact_id, enrollment_status, enrolled_at, last_error, contact:contacts!campaign_contacts_tenant_id_contact_id_fkey(name, title, email)")
      .eq("tenant_id", ctx.tenantId)
      .eq("campaign_id", campaignId)
      .order("created_at"),
    campaign.approved_by
      ? supabase.from("profiles").select("display_name").eq("id", campaign.approved_by).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from("provider_connections").select("mode, status").eq("tenant_id", ctx.tenantId).eq("id", campaign.provider_connection_id).single(),
  ]);
  if (mailboxes.error || enrollments.error || connection.error) throw new Error("Failed to load campaign details");

  return {
    campaign: {
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      mailboxId: campaign.mailbox_id,
      approvedAt: campaign.approved_at,
      approvedBy: approver.data?.display_name ?? null,
      lastError: campaign.last_error,
      dataMode: (connection.data.mode === "live" && connection.data.status === "connected" ? "live" : "mock") as "live" | "mock",
    },
    steps,
    mailboxes: mailboxes.data.map((m) => ({ id: m.id, email: m.email, status: m.status, dailyLimit: m.daily_limit })),
    compliance: checkCampaignCompliance({ postalAddress, steps }),
    enrollments: enrollments.data.map((e) => {
      const contact = Array.isArray(e.contact) ? e.contact[0] : e.contact;
      return {
        contactId: e.contact_id,
        status: e.enrollment_status as ExistingStatus,
        enrolledAt: e.enrolled_at,
        lastError: e.last_error,
        name: contact?.name ?? "Unknown",
        title: contact?.title ?? null,
        email: contact?.email ?? null,
      };
    }),
  };
}

/** Contacts that could be enrolled: have an email and aren't in this campaign yet. */
export async function loadEnrollableContacts(ctx: TenantContext, campaignId: string) {
  const supabase = await createUserClient();
  const [contacts, existing] = await Promise.all([
    supabase
      .from("contacts")
      .select("id, name, title, email, email_status, company:companies!contacts_tenant_id_company_id_fkey(name, is_customer)")
      .eq("tenant_id", ctx.tenantId)
      .not("email", "is", null)
      .order("name")
      .limit(500),
    supabase.from("campaign_contacts").select("contact_id, enrollment_status").eq("tenant_id", ctx.tenantId).eq("campaign_id", campaignId),
  ]);
  if (contacts.error || existing.error) throw new Error("Failed to load contacts");
  const taken = new Set(existing.data.filter((e) => e.enrollment_status !== "failed").map((e) => e.contact_id));
  return contacts.data
    .filter((c) => !taken.has(c.id))
    .map((c) => {
      const company = Array.isArray(c.company) ? c.company[0] : c.company;
      return { id: c.id, name: c.name, title: c.title, emailStatus: c.email_status, company: company?.name ?? null, isCustomer: company?.is_customer ?? false };
    });
}

export async function loadMailboxOptions(ctx: TenantContext) {
  const supabase = await createUserClient();
  const { data, error } = await supabase
    .from("provider_connections")
    .select("id, mailboxes:mailboxes!mailboxes_tenant_id_provider_connection_id_fkey(id, email, status)")
    .eq("tenant_id", ctx.tenantId)
    .eq("status", "connected")
    .maybeSingle();
  if (error) throw new Error("Failed to load mailboxes");
  if (!data) return { connectionId: null, mailboxes: [] };
  return { connectionId: data.id, mailboxes: (data.mailboxes ?? []).filter((m) => m.status === "active") };
}

// ---------------------------------------------------------------------------
// Draft editing (user client, RLS)
// ---------------------------------------------------------------------------

export const draftSchema = z.object({
  name: z.string().trim().min(1).max(200),
  mailboxId: z.uuid(),
});

export async function createDraft(ctx: TenantContext, input: z.infer<typeof draftSchema>) {
  assertCan(ctx.role, "campaign.edit");
  const supabase = await createUserClient();
  const { connectionId, mailboxes } = await loadMailboxOptions(ctx);
  if (!connectionId || !mailboxes.some((m) => m.id === input.mailboxId)) throw new CampaignStateError("Choose an active mailbox.");
  const { data, error } = await supabase
    .from("campaigns")
    .insert({ tenant_id: ctx.tenantId, provider_connection_id: connectionId, mailbox_id: input.mailboxId, name: input.name })
    .select("id")
    .single();
  if (error) throw new Error("Failed to create campaign");
  await audit(ctx, "campaign.created", { campaignId: data.id });
  return data.id;
}

export async function updateDraft(ctx: TenantContext, campaignId: string, input: z.infer<typeof draftSchema>) {
  assertCan(ctx.role, "campaign.edit");
  const supabase = await createUserClient();
  const { data, error } = await supabase
    .from("campaigns")
    .update({ name: input.name, mailbox_id: input.mailboxId })
    .eq("tenant_id", ctx.tenantId)
    .eq("id", campaignId)
    .eq("status", "draft")
    .select("id");
  // 23503: mailbox is not on this campaign's connection.
  if (error?.code === "23503") throw new CampaignStateError("Choose a mailbox from this campaign's connection.");
  if (error) throw new Error("Failed to update campaign");
  if (!data.length) throw new CampaignStateError("Only drafts can be edited.");
}

export const stepSchema = z
  .object({
    stepType: z.enum(["email", "task"]),
    delayDays: z.number().int().min(0).max(365),
    subject: z.string().trim().max(300).optional(),
    body: z.string().max(20_000),
  })
  .refine((s) => s.stepType !== "email" || (s.subject?.length ?? 0) > 0, { message: "Email steps need a subject", path: ["subject"] });

async function assertDraft(supabase: UserClient, ctx: TenantContext, campaignId: string) {
  const campaign = await loadCampaignRow(supabase, ctx, campaignId);
  if (campaign.status !== "draft") throw new CampaignStateError("Steps can only change while the campaign is a draft.");
}

export async function addStep(ctx: TenantContext, campaignId: string, input: z.infer<typeof stepSchema>) {
  assertCan(ctx.role, "campaign.edit");
  const supabase = await createUserClient();
  await assertDraft(supabase, ctx, campaignId);
  const steps = await loadSteps(supabase, ctx, campaignId);
  const { error } = await supabase.from("sequence_steps").insert({
    tenant_id: ctx.tenantId,
    campaign_id: campaignId,
    position: (steps.at(-1)?.position ?? 0) + 1,
    step_type: input.stepType,
    delay_days: input.delayDays,
    subject: input.stepType === "email" ? (input.subject ?? null) : null,
    body: input.body,
  });
  if (error) throw new Error("Failed to add step");
}

export async function updateStep(ctx: TenantContext, campaignId: string, stepId: string, input: z.infer<typeof stepSchema>) {
  assertCan(ctx.role, "campaign.edit");
  const supabase = await createUserClient();
  await assertDraft(supabase, ctx, campaignId);
  const { data, error } = await supabase
    .from("sequence_steps")
    .update({
      step_type: input.stepType,
      delay_days: input.delayDays,
      subject: input.stepType === "email" ? (input.subject ?? null) : null,
      body: input.body,
    })
    .eq("tenant_id", ctx.tenantId)
    .eq("campaign_id", campaignId)
    .eq("id", stepId)
    .select("id");
  if (error) throw new Error("Failed to update step");
  if (!data.length) throw new CampaignNotFoundError();
}

/** Deletes a step and renumbers the rest so positions stay 1..n. */
export async function deleteStep(ctx: TenantContext, campaignId: string, stepId: string) {
  assertCan(ctx.role, "campaign.edit");
  const supabase = await createUserClient();
  await assertDraft(supabase, ctx, campaignId);
  const { error } = await supabase.from("sequence_steps").delete().eq("tenant_id", ctx.tenantId).eq("campaign_id", campaignId).eq("id", stepId);
  if (error) throw new Error("Failed to delete step");
  const steps = await loadSteps(supabase, ctx, campaignId);
  for (const [index, step] of steps.entries()) {
    if (step.position !== index + 1) {
      const { error: moveError } = await supabase
        .from("sequence_steps")
        .update({ position: index + 1 })
        .eq("tenant_id", ctx.tenantId)
        .eq("id", step.id);
      if (moveError) throw new Error("Failed to renumber steps");
    }
  }
}

/** Swaps a step with the one above it (via a temporary position, as positions are unique). */
export async function moveStepUp(ctx: TenantContext, campaignId: string, stepId: string) {
  assertCan(ctx.role, "campaign.edit");
  const supabase = await createUserClient();
  await assertDraft(supabase, ctx, campaignId);
  const steps = await loadSteps(supabase, ctx, campaignId);
  const index = steps.findIndex((s) => s.id === stepId);
  const current = steps[index];
  const above = steps[index - 1];
  if (!current || !above) return;
  const temp = steps.length + 1000;
  for (const [id, position] of [
    [current.id, temp],
    [above.id, current.position],
    [current.id, above.position],
  ] as const) {
    const { error } = await supabase.from("sequence_steps").update({ position }).eq("tenant_id", ctx.tenantId).eq("id", id);
    if (error) throw new Error("Failed to reorder steps");
  }
}

// ---------------------------------------------------------------------------
// Status changes (service role, after explicit checks)
// ---------------------------------------------------------------------------

/**
 * Moves status with an optimistic check on the current value, so two people
 * acting at once cannot both succeed. The database trigger enforces the same
 * state machine and the compliance gate.
 */
async function transition(
  ctx: Scope,
  campaignId: string,
  from: CampaignStatus,
  to: CampaignStatus,
  extra: { approved_by?: string; approved_at?: string; external_id?: string; last_error?: string | null } = {},
) {
  assertTransition(from, to);
  const { data, error } = await createAdminClient()
    .from("campaigns")
    .update({ status: to, ...extra })
    .eq("tenant_id", ctx.tenantId)
    .eq("id", campaignId)
    .eq("status", from)
    .select("id");
  if (error?.code === "23514") throw new CampaignStateError(error.message.replace(/^campaign failed compliance check: /, "Compliance check failed: "));
  if (error) throw new Error("Failed to update campaign status");
  if (!data.length) throw new CampaignStateError("The campaign changed while you were working. Reload and try again.");
}

export async function approveCampaign(ctx: TenantContext, campaignId: string) {
  assertCan(ctx.role, "campaign.approve");
  const supabase = await createUserClient();
  const campaign = await loadCampaignRow(supabase, ctx, campaignId);
  if (!campaign.mailbox_id) throw new CampaignStateError("Choose a mailbox before approving.");
  const problems = checkCampaignCompliance({ postalAddress: await loadPostalAddress(supabase, ctx), steps: await loadSteps(supabase, ctx, campaignId) });
  if (problems.length) throw new CampaignComplianceError(problems);
  await transition(ctx, campaignId, campaign.status, "approved", { approved_by: ctx.userId, approved_at: new Date().toISOString() });
  await audit(ctx, "campaign.approved", { campaignId });
}

/** Back to draft for edits; clears the approval (the trigger also clears it). */
export async function returnToDraft(ctx: TenantContext, campaignId: string) {
  assertCan(ctx.role, "campaign.edit");
  const supabase = await createUserClient();
  const campaign = await loadCampaignRow(supabase, ctx, campaignId);
  await transition(ctx, campaignId, campaign.status, "draft");
  await audit(ctx, "campaign.returned_to_draft", { campaignId });
}

async function adaptersFor(ctx: Scope, connectionId: string): Promise<ProviderAdapters> {
  const adapters = await getProviderRegistry().forTenant(ctx);
  // The campaign must run on the tenant's current connection.
  if (adapters.connectionId !== connectionId) throw new CampaignStateError("This campaign's provider connection is no longer active.");
  return adapters;
}

export async function pauseCampaign(ctx: TenantContext, campaignId: string) {
  assertCan(ctx.role, "campaign.enroll");
  const supabase = await createUserClient();
  const campaign = await loadCampaignRow(supabase, ctx, campaignId);
  assertTransition(campaign.status, "paused");
  const adapters = await adaptersFor(ctx, campaign.provider_connection_id);
  if (campaign.external_id) await adapters.outreach.pauseSequence(campaign.external_id);
  await transition(ctx, campaignId, campaign.status, "paused");
  await audit(ctx, "campaign.paused", { campaignId });
}

/** Resume = activation, so opt-outs are synced and suppression re-applied first. */
export async function resumeCampaign(ctx: TenantContext, campaignId: string) {
  assertCan(ctx.role, "campaign.enroll");
  const supabase = await createUserClient();
  const campaign = await loadCampaignRow(supabase, ctx, campaignId);
  assertTransition(campaign.status, "active");
  const adapters = await adaptersFor(ctx, campaign.provider_connection_id);
  await syncOptOuts(ctx.tenantId, adapters);
  await markNewlySuppressed(ctx, campaignId);
  if (campaign.external_id) await adapters.outreach.activateSequence(campaign.external_id);
  await transition(ctx, campaignId, campaign.status, "active");
  await audit(ctx, "campaign.resumed", { campaignId });
}

export async function completeCampaign(ctx: TenantContext, campaignId: string) {
  assertCan(ctx.role, "campaign.enroll");
  const supabase = await createUserClient();
  const campaign = await loadCampaignRow(supabase, ctx, campaignId);
  assertTransition(campaign.status, "completed");
  const adapters = await adaptersFor(ctx, campaign.provider_connection_id);
  if (campaign.status === "active" && campaign.external_id) await adapters.outreach.pauseSequence(campaign.external_id);
  await transition(ctx, campaignId, campaign.status, "completed");
  await audit(ctx, "campaign.completed", { campaignId });
}

// ---------------------------------------------------------------------------
// Enrollment
// ---------------------------------------------------------------------------

async function loadSuppressionSet(ctx: Scope) {
  const { data, error } = await createAdminClient().from("suppression_entries").select("scope, value_hash").eq("tenant_id", ctx.tenantId);
  if (error) throw new Error("Failed to load suppressions");
  return {
    emails: new Set(data.filter((s) => s.scope === "email").map((s) => s.value_hash)),
    domains: new Set(data.filter((s) => s.scope === "domain").map((s) => s.value_hash)),
  };
}

/** After an opt-out sync, flag enrolled contacts who are now suppressed (shown in the UI). */
async function markNewlySuppressed(ctx: Scope, campaignId: string) {
  const db = createAdminClient();
  const { data, error } = await db
    .from("campaign_contacts")
    .select("contact_id, contact:contacts!campaign_contacts_tenant_id_contact_id_fkey(email, external_ref)")
    .eq("tenant_id", ctx.tenantId)
    .eq("campaign_id", campaignId)
    .in("enrollment_status", ["enrolled", "enrolling", "pending"]);
  if (error) throw new Error("Failed to load enrollments");
  const suppressions = await loadSuppressionSet(ctx);
  const candidates = data.map((row) => {
    const contact = Array.isArray(row.contact) ? row.contact[0] : row.contact;
    return { contactId: row.contact_id, email: contact?.email ?? null, externalRef: contact?.external_ref ?? null };
  });
  const { suppressed, noEmail } = planEnrollment(candidates, suppressions, new Map());
  const ids = [...suppressed, ...noEmail].map((c) => c.contactId);
  if (ids.length) {
    await db
      .from("campaign_contacts")
      .update({ enrollment_status: "suppressed", last_error: "Suppressed after an opt-out sync" })
      .eq("tenant_id", ctx.tenantId)
      .eq("campaign_id", campaignId)
      .in("contact_id", ids);
  }
}

export interface EnrollmentSummary {
  enrolled: number;
  failed: number;
  suppressed: number;
  noEmail: number;
  alreadyEnrolled: number;
  optOutsSynced: number;
}

export const enrollSchema = z.object({
  campaignId: z.uuid(),
  contactIds: z.array(z.uuid()).min(1).max(200),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9-]{16,100}$/),
});

/**
 * Enrolls contacts, then activates the campaign if it isn't active yet.
 *
 * 1. Idempotency key claimed: a retried or double submit returns the first result.
 * 2. Opt-outs synced from the provider into suppression (required; failure stops here).
 * 3. Suppression re-checked for every contact (the DB trigger checks again).
 * 4. Provider sequence created with a key derived from the campaign id, so a
 *    retry never creates a second one.
 * 5. Rows marked `enrolling` before the provider call, then `enrolled`/`failed`
 *    after. Rows left `enrolling` by a crash or timeout are retried by
 *    retryPendingEnrollments(); the provider call is idempotent per contact.
 */
export async function enrollContacts(ctx: TenantContext, input: z.infer<typeof enrollSchema>) {
  assertCan(ctx.role, "campaign.enroll");
  const contactIds = [...new Set(input.contactIds)].sort();
  return runIdempotent(
    supabaseIdempotencyStore(ctx.tenantId),
    { key: input.idempotencyKey, operation: "campaign.enroll", request: { campaignId: input.campaignId, contactIds } },
    () => doEnroll(ctx, input.campaignId, contactIds),
  );
}

async function doEnroll(ctx: TenantContext, campaignId: string, contactIds: string[]): Promise<EnrollmentSummary> {
  const supabase = await createUserClient();
  const db = createAdminClient();
  const campaign = await loadCampaignRow(supabase, ctx, campaignId);
  if (!ENROLLABLE.includes(campaign.status)) throw new CampaignStateError("Approve the campaign before enrolling contacts.");
  if (!campaign.mailbox_id) throw new CampaignStateError("Choose a mailbox first.");

  const adapters = await adaptersFor(ctx, campaign.provider_connection_id);
  const { added: optOutsSynced } = await syncOptOuts(ctx.tenantId, adapters);

  const [contacts, existing, mailbox, suppressions] = await Promise.all([
    supabase.from("contacts").select("id, email, external_ref").eq("tenant_id", ctx.tenantId).in("id", contactIds),
    db.from("campaign_contacts").select("contact_id, enrollment_status").eq("tenant_id", ctx.tenantId).eq("campaign_id", campaignId),
    supabase.from("mailboxes").select("external_id").eq("tenant_id", ctx.tenantId).eq("id", campaign.mailbox_id).single(),
    loadSuppressionSet(ctx),
  ]);
  if (contacts.error || existing.error || mailbox.error) throw new Error("Failed to load enrollment data");

  const candidates: EnrollmentCandidate[] = contacts.data.map((c) => ({ contactId: c.id, email: c.email, externalRef: c.external_ref }));
  const plan = planEnrollment(
    candidates,
    suppressions,
    new Map(existing.data.map((e) => [e.contact_id, e.enrollment_status as ExistingStatus])),
  );

  // Record suppressed contacts so it's visible why they weren't enrolled.
  if (plan.suppressed.length) {
    await db.from("campaign_contacts").upsert(
      plan.suppressed.map((c) => ({
        tenant_id: ctx.tenantId,
        campaign_id: campaignId,
        contact_id: c.contactId,
        enrollment_status: "suppressed",
        last_error: "Suppressed at enrollment",
      })),
      { onConflict: "tenant_id,campaign_id,contact_id" },
    );
  }

  const summary: EnrollmentSummary = {
    enrolled: 0,
    failed: 0,
    suppressed: plan.suppressed.length,
    noEmail: plan.noEmail.length,
    alreadyEnrolled: plan.alreadyEnrolled.length,
    optOutsSynced,
  };
  if (plan.toEnroll.length === 0) {
    await audit(ctx, "campaign.enrollment_skipped", { campaignId, ...summary });
    return summary;
  }

  // Provider sequence: deterministic key so retries reuse the same one.
  let sequenceId = campaign.external_id;
  if (!sequenceId) {
    const steps = await loadSteps(supabase, ctx, campaignId);
    sequenceId = await adapters.outreach.createSequence({
      name: campaign.name,
      mailboxExternalId: mailbox.data.external_id ?? "",
      steps: steps.map((s) => ({ position: s.position, stepType: s.stepType, delayDays: s.delayDays, subject: s.subject, body: s.body })),
      idempotencyKey: `campaign:${campaignId}`,
    });
    const { error } = await db.from("campaigns").update({ external_id: sequenceId }).eq("tenant_id", ctx.tenantId).eq("id", campaignId);
    if (error) throw new Error("Failed to store sequence id");
  }

  let status = campaign.status;
  if (status === "approved" || status === "failed") {
    await transition(ctx, campaignId, status, "enrolling", { last_error: null });
    status = "enrolling";
  }

  // Mark in flight first: the DB trigger re-checks approval and suppression here.
  const { error: markError } = await db.from("campaign_contacts").upsert(
    plan.toEnroll.map((c) => ({
      tenant_id: ctx.tenantId,
      campaign_id: campaignId,
      contact_id: c.contactId,
      enrollment_status: "enrolling",
      last_error: null,
    })),
    { onConflict: "tenant_id,campaign_id,contact_id" },
  );
  if (markError) throw new CampaignStateError("Enrollment was refused by the database safety checks.");

  try {
    const result = await sendToProvider(ctx, campaignId, sequenceId, mailbox.data.external_id ?? "", plan.toEnroll);
    summary.enrolled = result.enrolled;
    summary.failed = result.failed;
    if (status === "enrolling") {
      await adapters.outreach.activateSequence(sequenceId);
      await transition(ctx, campaignId, "enrolling", "active");
    }
  } catch (error) {
    // Rows stay `enrolling` for retryPendingEnrollments(); the campaign shows the error.
    if (status === "enrolling") await transition(ctx, campaignId, "enrolling", "failed", { last_error: errorText(error) });
    await audit(ctx, "campaign.enrollment_failed", { campaignId, error: errorText(error) });
    throw error;
  }

  await audit(ctx, "campaign.enrolled", { campaignId, ...summary, mode: adapters.mode });
  return summary;
}

async function sendToProvider(
  ctx: Scope,
  campaignId: string,
  sequenceId: string,
  mailboxExternalId: string,
  contacts: EnrollmentCandidate[],
) {
  const adapters = await getProviderRegistry().forTenant(ctx);
  const db = createAdminClient();
  const byProviderId = new Map(contacts.map((c) => [providerContactId(c), c]));
  const result = await adapters.outreach.enrollContacts({
    sequenceExternalId: sequenceId,
    mailboxExternalId,
    contacts: contacts.map((c) => ({ contactId: c.contactId, externalContactId: providerContactId(c) })),
    // Per-batch key derived from the contents, so a retry of the same batch is a no-op at the provider.
    idempotencyKey: `enroll:${campaignId}:${[...byProviderId.keys()].sort().join(",")}`.slice(0, 200),
  });
  const now = new Date().toISOString();
  for (const e of result.enrolled) {
    await db
      .from("campaign_contacts")
      .update({ enrollment_status: "enrolled", enrolled_at: now, external_ref: e.externalRef, last_error: null })
      .eq("tenant_id", ctx.tenantId)
      .eq("campaign_id", campaignId)
      .eq("contact_id", e.contactId);
  }
  for (const f of result.failed) {
    await db
      .from("campaign_contacts")
      .update({ enrollment_status: "failed", last_error: redactString(f.reason).slice(0, 500) })
      .eq("tenant_id", ctx.tenantId)
      .eq("campaign_id", campaignId)
      .eq("contact_id", f.contactId);
  }
  return { enrolled: result.enrolled.length, failed: result.failed.length };
}

/**
 * Reconciliation: re-sends contacts stuck in `enrolling` (crash or timeout
 * after marking, before the provider answered). Safe to repeat because the
 * provider maps the same sequence + contact to the same enrollment.
 */
export async function retryPendingEnrollments(ctx: TenantContext, campaignId: string) {
  assertCan(ctx.role, "campaign.enroll");
  return reconcileEnrollments(ctx, campaignId, { recoverFailedCampaign: true });
}

/**
 * Core of reconciliation, shared with the background job (userId null).
 * `staleBefore` skips rows touched recently, so a job never races an
 * enrollment that is still in progress. Only a person (recoverFailedCampaign)
 * may move a failed campaign back to active.
 */
export async function reconcileEnrollments(
  ctx: Scope,
  campaignId: string,
  options: { recoverFailedCampaign: boolean; staleBefore?: Date },
) {
  const db = createAdminClient();
  const campaign = await loadCampaignRow(db, ctx, campaignId);
  if (!campaign.external_id) throw new CampaignStateError("Nothing to retry yet.");
  const adapters = await adaptersFor(ctx, campaign.provider_connection_id);
  await syncOptOuts(ctx.tenantId, adapters);
  await markNewlySuppressed(ctx, campaignId);

  let query = db
    .from("campaign_contacts")
    .select("contact_id, contact:contacts!campaign_contacts_tenant_id_contact_id_fkey(email, external_ref)")
    .eq("tenant_id", ctx.tenantId)
    .eq("campaign_id", campaignId)
    .eq("enrollment_status", "enrolling");
  if (options.staleBefore) query = query.lt("updated_at", options.staleBefore.toISOString());
  const { data, error } = await query;
  if (error) throw new Error("Failed to load pending enrollments");
  const pending: EnrollmentCandidate[] = data.map((row) => {
    const contact = Array.isArray(row.contact) ? row.contact[0] : row.contact;
    return { contactId: row.contact_id, email: contact?.email ?? null, externalRef: contact?.external_ref ?? null };
  });
  let result = { enrolled: 0, failed: 0 };
  if (pending.length) {
    const { data: mailbox } = await db.from("mailboxes").select("external_id").eq("tenant_id", ctx.tenantId).eq("id", campaign.mailbox_id ?? "").maybeSingle();
    result = await sendToProvider(ctx, campaignId, campaign.external_id, mailbox?.external_id ?? "", pending);
  }
  // A campaign that failed (e.g. at activation) recovers once nothing is left pending.
  if (options.recoverFailedCampaign && campaign.status === "failed") {
    await transition(ctx, campaignId, "failed", "enrolling", { last_error: null });
    await adapters.outreach.activateSequence(campaign.external_id);
    await transition(ctx, campaignId, "enrolling", "active");
  }
  if (pending.length || options.recoverFailedCampaign) {
    await audit(ctx, "campaign.enrollment_retried", { campaignId, ...result, automatic: ctx.userId === null });
  }
  return result;
}
