import "server-only";
import { z } from "zod";
import type { TenantContext } from "@/server/auth/tenant-context";
import { assertCan, can, ForbiddenError } from "@/server/auth/roles";
import { audit } from "@/server/audit";
import { createUserClient } from "@/server/supabase/server";
import { loadTeam, type TeamMember } from "@/server/tenants/team";
import { OPPORTUNITY_STAGES, type OpportunityStage } from "./stages";

// Runs as the signed-in user: RLS limits rows to the tenant and lets reps edit
// only opportunities they own. Every query also filters by ctx.tenantId.

export class NotFoundOrForbiddenError extends Error {
  constructor() {
    super("Record not found, or you don't have permission to change it");
    this.name = "NotFoundOrForbiddenError";
  }
}

export class ContactCompanyMismatchError extends Error {
  constructor() {
    super("The contact does not work at the selected company");
    this.name = "ContactCompanyMismatchError";
  }
}

const stageSchema = z.enum(OPPORTUNITY_STAGES);

const OPPORTUNITY_SELECT = `
  id, title, stage, estimated_value, owner_id, quote_requested_at, closed_at, lost_reason, created_at, updated_at,
  company:companies!opportunities_tenant_id_company_id_fkey(id, name, domain),
  contact:contacts!opportunities_tenant_id_contact_id_fkey(id, name, title, email),
  campaign:campaigns!opportunities_tenant_id_source_campaign_id_fkey(id, name)
` as const;

export interface OpportunityCard {
  id: string;
  title: string;
  stage: OpportunityStage;
  estimatedValue: number | null;
  owner: { id: string; name: string } | null;
  company: { id: string; name: string; domain: string | null } | null;
  contact: { id: string; name: string; title: string | null; email: string | null } | null;
  sourceCampaign: { id: string; name: string } | null;
  quoteRequestedAt: string | null;
  closedAt: string | null;
  lostReason: string | null;
  updatedAt: string;
  /** Whether the current user may edit it (mirrors the RLS policy). */
  editable: boolean;
}

const one = <T,>(value: T | T[] | null): T | null => (Array.isArray(value) ? (value[0] ?? null) : value);

function toCard(row: Record<string, unknown>, team: Map<string, TeamMember>, ctx: TenantContext): OpportunityCard {
  const r = row as {
    id: string; title: string; stage: string; estimated_value: number | string | null; owner_id: string | null;
    quote_requested_at: string | null; closed_at: string | null; lost_reason: string | null; updated_at: string;
    company: unknown; contact: unknown; campaign: unknown;
  };
  const owner = r.owner_id ? team.get(r.owner_id) : undefined;
  return {
    id: r.id,
    title: r.title,
    stage: stageSchema.parse(r.stage),
    estimatedValue: r.estimated_value === null ? null : Number(r.estimated_value),
    owner: r.owner_id ? { id: r.owner_id, name: owner?.displayName ?? "Former member" } : null,
    company: one(r.company as OpportunityCard["company"] | null),
    contact: one(r.contact as OpportunityCard["contact"] | null),
    sourceCampaign: one(r.campaign as OpportunityCard["sourceCampaign"] | null),
    quoteRequestedAt: r.quote_requested_at,
    closedAt: r.closed_at,
    lostReason: r.lost_reason,
    updatedAt: r.updated_at,
    editable: can(ctx.role, "opportunity.reassign") || r.owner_id === ctx.userId,
  };
}

export async function loadPipeline(ctx: TenantContext, filter: { owner: "all" | "me" }) {
  assertCan(ctx.role, "crm.read");
  const supabase = await createUserClient();
  let query = supabase.from("opportunities").select(OPPORTUNITY_SELECT).eq("tenant_id", ctx.tenantId).order("updated_at", { ascending: false });
  if (filter.owner === "me") query = query.eq("owner_id", ctx.userId);
  const [{ data, error }, members] = await Promise.all([query, loadTeam(ctx)]);
  if (error) throw new Error("Failed to load pipeline");
  const team = new Map(members.map((m) => [m.userId, m]));
  return { opportunities: data.map((row) => toCard(row, team, ctx)), team: members };
}

export async function loadOpportunity(ctx: TenantContext, id: string) {
  assertCan(ctx.role, "crm.read");
  const supabase = await createUserClient();
  const [opp, members, notes, tasks] = await Promise.all([
    supabase.from("opportunities").select(OPPORTUNITY_SELECT).eq("tenant_id", ctx.tenantId).eq("id", id).maybeSingle(),
    loadTeam(ctx),
    supabase
      .from("notes")
      .select("id, body, author_id, created_at")
      .eq("tenant_id", ctx.tenantId)
      .eq("entity_type", "opportunity")
      .eq("entity_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("tasks")
      .select("id, title, due_at, completed_at, owner_id")
      .eq("tenant_id", ctx.tenantId)
      .eq("opportunity_id", id)
      .order("completed_at", { ascending: true, nullsFirst: true })
      .order("due_at", { ascending: true }),
  ]);
  if (opp.error || notes.error || tasks.error) throw new Error("Failed to load opportunity");
  if (!opp.data) return null;
  const team = new Map(members.map((m) => [m.userId, m]));
  const card = toCard(opp.data, team, ctx);

  let activities: { id: string; eventType: string; occurredAt: string }[] = [];
  if (card.contact) {
    const { data, error } = await supabase
      .from("activities")
      .select("id, event_type, occurred_at")
      .eq("tenant_id", ctx.tenantId)
      .eq("contact_id", card.contact.id)
      .order("occurred_at", { ascending: false })
      .limit(20);
    if (error) throw new Error("Failed to load activity");
    activities = data.map((a) => ({ id: a.id, eventType: a.event_type, occurredAt: a.occurred_at }));
  }

  const name = (userId: string | null) => (userId ? (team.get(userId)?.displayName ?? "Former member") : "—");
  return {
    opportunity: card,
    team: members,
    notes: notes.data.map((n) => ({ id: n.id, body: n.body, author: name(n.author_id), createdAt: n.created_at })),
    tasks: tasks.data.map((t) => ({ id: t.id, title: t.title, dueAt: t.due_at, completedAt: t.completed_at, owner: name(t.owner_id) })),
    activities,
  };
}

export const moveStageSchema = z
  .object({
    opportunityId: z.uuid(),
    stage: stageSchema,
    lostReason: z.string().trim().max(500).optional(),
  })
  .refine((v) => v.stage !== "lost" || (v.lostReason?.length ?? 0) > 0, { message: "A lost reason is required", path: ["lostReason"] });

export async function moveOpportunityStage(ctx: TenantContext, input: z.infer<typeof moveStageSchema>) {
  assertCan(ctx.role, "crm.write");
  const supabase = await createUserClient();
  const { data, error } = await supabase
    .from("opportunities")
    .update({ stage: input.stage, lost_reason: input.stage === "lost" ? (input.lostReason ?? null) : null })
    .eq("tenant_id", ctx.tenantId)
    .eq("id", input.opportunityId)
    .select("id");
  if (error) throw new Error("Failed to move opportunity");
  if (!data.length) throw new NotFoundOrForbiddenError();
  await audit(ctx, "opportunity.stage_changed", { opportunityId: input.opportunityId, stage: input.stage });
}

export const createOpportunitySchema = z.object({
  companyId: z.uuid(),
  contactId: z.uuid().optional(),
  title: z.string().trim().min(1).max(200),
  estimatedValue: z.number().nonnegative().max(1e12).optional(),
  ownerId: z.uuid().optional(),
});

export async function createOpportunity(ctx: TenantContext, input: z.infer<typeof createOpportunitySchema>) {
  assertCan(ctx.role, "crm.write");
  const ownerId = input.ownerId ?? ctx.userId;
  if (ownerId !== ctx.userId && !can(ctx.role, "opportunity.reassign")) throw new ForbiddenError("opportunity.reassign");
  const supabase = await createUserClient();
  if (input.contactId) {
    const { data: contact } = await supabase
      .from("contacts")
      .select("company_id")
      .eq("tenant_id", ctx.tenantId)
      .eq("id", input.contactId)
      .maybeSingle();
    if (contact?.company_id !== input.companyId) throw new ContactCompanyMismatchError();
  }
  const { data, error } = await supabase
    .from("opportunities")
    .insert({
      tenant_id: ctx.tenantId,
      company_id: input.companyId,
      contact_id: input.contactId ?? null,
      owner_id: ownerId,
      title: input.title,
      estimated_value: input.estimatedValue ?? null,
    })
    .select("id")
    .single();
  // 23503: company, contact, or owner is not in this tenant (composite FKs).
  if (error?.code === "23503") throw new NotFoundOrForbiddenError();
  if (error) throw new Error("Failed to create opportunity");
  await audit(ctx, "opportunity.created", { opportunityId: data.id });
  return data.id;
}

export async function reassignOpportunity(ctx: TenantContext, input: { opportunityId: string; ownerId: string }) {
  assertCan(ctx.role, "opportunity.reassign");
  const supabase = await createUserClient();
  const { data, error } = await supabase
    .from("opportunities")
    .update({ owner_id: input.ownerId })
    .eq("tenant_id", ctx.tenantId)
    .eq("id", input.opportunityId)
    .select("id");
  if (error?.code === "23503") throw new NotFoundOrForbiddenError();
  if (error) throw new Error("Failed to reassign opportunity");
  if (!data.length) throw new NotFoundOrForbiddenError();
  await audit(ctx, "opportunity.reassigned", { opportunityId: input.opportunityId, ownerId: input.ownerId });
}

export async function addOpportunityNote(ctx: TenantContext, input: { opportunityId: string; body: string }) {
  assertCan(ctx.role, "crm.write");
  const supabase = await createUserClient();
  const { error } = await supabase.from("notes").insert({
    tenant_id: ctx.tenantId,
    entity_type: "opportunity",
    entity_id: input.opportunityId,
    author_id: ctx.userId,
    body: input.body,
  });
  if (error?.code === "23503") throw new NotFoundOrForbiddenError();
  if (error) throw new Error("Failed to add note");
}

export async function addOpportunityTask(ctx: TenantContext, input: { opportunityId: string; title: string; dueAt: string | null }) {
  assertCan(ctx.role, "crm.write");
  const supabase = await createUserClient();
  const { error } = await supabase.from("tasks").insert({
    tenant_id: ctx.tenantId,
    opportunity_id: input.opportunityId,
    owner_id: ctx.userId,
    title: input.title,
    due_at: input.dueAt,
  });
  if (error?.code === "23503") throw new NotFoundOrForbiddenError();
  if (error) throw new Error("Failed to add task");
}

export async function setTaskCompleted(ctx: TenantContext, input: { taskId: string; completed: boolean }) {
  assertCan(ctx.role, "crm.write");
  const supabase = await createUserClient();
  const { data, error } = await supabase
    .from("tasks")
    .update({ completed_at: input.completed ? new Date().toISOString() : null })
    .eq("tenant_id", ctx.tenantId)
    .eq("id", input.taskId)
    .select("id");
  if (error) throw new Error("Failed to update task");
  if (!data.length) throw new NotFoundOrForbiddenError();
}

/** Companies and their contacts for the "new opportunity" form. */
export async function loadCompanyOptions(ctx: TenantContext) {
  const supabase = await createUserClient();
  const [companies, contacts] = await Promise.all([
    supabase.from("companies").select("id, name").eq("tenant_id", ctx.tenantId).eq("is_customer", false).order("name").limit(500),
    supabase.from("contacts").select("id, name, company_id").eq("tenant_id", ctx.tenantId).order("name").limit(2000),
  ]);
  if (companies.error || contacts.error) throw new Error("Failed to load companies");
  return {
    companies: companies.data,
    contacts: contacts.data.flatMap((c) => (c.company_id ? [{ id: c.id, name: c.name, companyId: c.company_id }] : [])),
  };
}
