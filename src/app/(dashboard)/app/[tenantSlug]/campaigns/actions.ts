"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ForbiddenError } from "@/server/auth/roles";
import { requireTenantContext } from "@/server/auth/tenant-context";
import {
  addStep,
  approveCampaign,
  CampaignComplianceError,
  CampaignNotFoundError,
  CampaignStateError,
  completeCampaign,
  createDraft,
  deleteStep,
  draftSchema,
  enrollContacts,
  enrollSchema,
  moveStepUp,
  pauseCampaign,
  resumeCampaign,
  retryPendingEnrollments,
  returnToDraft,
  stepSchema,
  updateDraft,
  updateStep,
} from "@/server/campaigns/campaigns";
import { IdempotencyConflictError } from "@/server/campaigns/idempotency";
import { InvalidTransitionError } from "@/server/campaigns/state";
import { describeProblem } from "@/server/compliance/template-check";
import { log } from "@/server/log";
import { ProviderUnavailableError } from "@/server/providers/errors";

// Each action re-resolves the tenant from the user's membership; the slug in
// the form only selects which of the user's tenants is meant.

export interface ActionState {
  error?: string;
  ok?: boolean;
}

const slugOf = (fd: FormData) => String(fd.get("tenantSlug") ?? "");
const idSchema = z.uuid();
const text = (fd: FormData, key: string) => {
  const value = fd.get(key);
  return typeof value === "string" ? value : undefined;
};

function friendly(error: unknown): string {
  if (error instanceof CampaignComplianceError) return error.problems.map(describeProblem).join(" ");
  if (error instanceof CampaignStateError) return error.message;
  if (error instanceof InvalidTransitionError) return "That action isn't available in the campaign's current state.";
  if (error instanceof ForbiddenError) return "You don't have permission to do that.";
  if (error instanceof CampaignNotFoundError) return "Campaign not found.";
  if (error instanceof IdempotencyConflictError) {
    return error.reason === "in_progress" ? "This enrollment is already being processed." : "Reload the page and try again.";
  }
  if (error instanceof ProviderUnavailableError) return "The outreach provider is unavailable. An admin can check Settings → Integrations.";
  // Anything else (usually a provider call failing) is logged, not shown raw.
  log.error("campaign action failed", { error });
  return "Something went wrong talking to the outreach provider. Try again; retries are safe.";
}

function refresh(slug: string, campaignId?: string) {
  revalidatePath(`/app/${slug}/campaigns`);
  if (campaignId) revalidatePath(`/app/${slug}/campaigns/${campaignId}`);
}

export async function createCampaignAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = draftSchema.safeParse({ name: fd.get("name"), mailboxId: fd.get("mailboxId") });
  if (!parsed.success) return { error: "Enter a name and choose a mailbox." };
  const ctx = await requireTenantContext(slugOf(fd));
  let id: string;
  try {
    id = await createDraft(ctx, parsed.data);
  } catch (error) {
    return { error: friendly(error) };
  }
  redirect(`/app/${ctx.tenantSlug}/campaigns/${id}`);
}

export async function updateDraftAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const campaignId = idSchema.safeParse(fd.get("campaignId"));
  const parsed = draftSchema.safeParse({ name: fd.get("name"), mailboxId: fd.get("mailboxId") });
  if (!campaignId.success || !parsed.success) return { error: "Enter a name and choose a mailbox." };
  const ctx = await requireTenantContext(slugOf(fd));
  try {
    await updateDraft(ctx, campaignId.data, parsed.data);
  } catch (error) {
    return { error: friendly(error) };
  }
  refresh(ctx.tenantSlug, campaignId.data);
  return { ok: true };
}

function parseStep(fd: FormData) {
  return stepSchema.safeParse({
    stepType: fd.get("stepType"),
    delayDays: Number(fd.get("delayDays") ?? 0),
    subject: text(fd, "subject")?.trim() || undefined,
    body: text(fd, "body") ?? "",
  });
}

export async function saveStepAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const campaignId = idSchema.safeParse(fd.get("campaignId"));
  const stepId = text(fd, "stepId");
  const step = parseStep(fd);
  if (!campaignId.success) return { error: "Campaign not found." };
  if (!step.success) return { error: step.error.issues[0]?.message ?? "Check the step." };
  const ctx = await requireTenantContext(slugOf(fd));
  try {
    if (stepId) {
      const id = idSchema.safeParse(stepId);
      if (!id.success) return { error: "Step not found." };
      await updateStep(ctx, campaignId.data, id.data, step.data);
    } else {
      await addStep(ctx, campaignId.data, step.data);
    }
  } catch (error) {
    return { error: friendly(error) };
  }
  refresh(ctx.tenantSlug, campaignId.data);
  // Keep the edit form's values after saving an existing step; reset the "add" form.
  return { ok: !stepId };
}

export async function stepCommandAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const campaignId = idSchema.safeParse(fd.get("campaignId"));
  const stepId = idSchema.safeParse(fd.get("stepId"));
  const command = fd.get("command");
  if (!campaignId.success || !stepId.success) return { error: "Step not found." };
  const ctx = await requireTenantContext(slugOf(fd));
  try {
    if (command === "delete") await deleteStep(ctx, campaignId.data, stepId.data);
    else if (command === "up") await moveStepUp(ctx, campaignId.data, stepId.data);
    else return { error: "Unknown command." };
  } catch (error) {
    return { error: friendly(error) };
  }
  refresh(ctx.tenantSlug, campaignId.data);
  return {};
}

const STATUS_COMMANDS = {
  approve: approveCampaign,
  draft: returnToDraft,
  pause: pauseCampaign,
  resume: resumeCampaign,
  complete: completeCampaign,
  retry: retryPendingEnrollments,
} as const;

export async function campaignCommandAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const campaignId = idSchema.safeParse(fd.get("campaignId"));
  const command = fd.get("command");
  if (!campaignId.success || typeof command !== "string" || !(command in STATUS_COMMANDS)) return { error: "Unknown action." };
  const ctx = await requireTenantContext(slugOf(fd));
  try {
    await STATUS_COMMANDS[command as keyof typeof STATUS_COMMANDS](ctx, campaignId.data);
  } catch (error) {
    refresh(ctx.tenantSlug, campaignId.data);
    return { error: friendly(error) };
  }
  refresh(ctx.tenantSlug, campaignId.data);
  return {};
}

export async function enrollAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = enrollSchema.safeParse({
    campaignId: fd.get("campaignId"),
    contactIds: fd.getAll("contactId"),
    idempotencyKey: fd.get("idempotencyKey"),
  });
  if (!parsed.success) return { error: "Select at least one contact." };
  const ctx = await requireTenantContext(slugOf(fd));
  let summary;
  try {
    ({ result: summary } = await enrollContacts(ctx, parsed.data));
  } catch (error) {
    refresh(ctx.tenantSlug, parsed.data.campaignId);
    return { error: friendly(error) };
  }
  const s = summary;
  redirect(
    `/app/${ctx.tenantSlug}/campaigns/${parsed.data.campaignId}?enrolled=${[s.enrolled, s.failed, s.suppressed, s.noEmail, s.alreadyEnrolled, s.optOutsSynced].join(".")}`,
  );
}
