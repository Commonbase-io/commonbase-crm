"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ForbiddenError } from "@/server/auth/roles";
import { requireTenantContext } from "@/server/auth/tenant-context";
import {
  addOpportunityNote,
  addOpportunityTask,
  ContactCompanyMismatchError,
  createOpportunity,
  createOpportunitySchema,
  moveOpportunityStage,
  moveStageSchema,
  NotFoundOrForbiddenError,
  reassignOpportunity,
  setTaskCompleted,
} from "@/server/crm/pipeline";

// Every action re-resolves the tenant from the user's membership; the slug in
// the form only says which of the user's tenants is meant.

export interface ActionState {
  error?: string;
  ok?: boolean;
}

const slugOf = (formData: FormData) => String(formData.get("tenantSlug") ?? "");
const str = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
};

function friendly(error: unknown): string {
  if (error instanceof ContactCompanyMismatchError) return "That contact doesn't work at the selected company.";
  if (error instanceof NotFoundOrForbiddenError || error instanceof ForbiddenError) {
    return "You don't have permission to change this.";
  }
  throw error;
}

export async function moveStageAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = moveStageSchema.safeParse({
    opportunityId: formData.get("opportunityId"),
    stage: formData.get("stage"),
    lostReason: str(formData, "lostReason"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues.some((i) => i.path[0] === "lostReason") ? "Enter a reason for losing this deal." : "Invalid stage." };
  }
  const ctx = await requireTenantContext(slugOf(formData));
  try {
    await moveOpportunityStage(ctx, parsed.data);
  } catch (error) {
    return { error: friendly(error) };
  }
  revalidatePath(`/app/${ctx.tenantSlug}/pipeline`, "layout");
  return { ok: true };
}

export async function createOpportunityAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const value = str(formData, "estimatedValue");
  const parsed = createOpportunitySchema.safeParse({
    companyId: formData.get("companyId"),
    contactId: str(formData, "contactId"),
    title: formData.get("title"),
    estimatedValue: value === undefined ? undefined : Number(value.replace(/[$,\s]/g, "")),
    ownerId: str(formData, "ownerId"),
  });
  if (!parsed.success) return { error: "Check the company, title, and value." };
  const ctx = await requireTenantContext(slugOf(formData));
  let id: string;
  try {
    id = await createOpportunity(ctx, parsed.data);
  } catch (error) {
    return { error: friendly(error) };
  }
  redirect(`/app/${ctx.tenantSlug}/pipeline/${id}`);
}

const idSchema = z.uuid();

export async function reassignAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const opportunityId = idSchema.safeParse(formData.get("opportunityId"));
  const ownerId = idSchema.safeParse(formData.get("ownerId"));
  if (!opportunityId.success || !ownerId.success) return { error: "Choose an owner." };
  const ctx = await requireTenantContext(slugOf(formData));
  try {
    await reassignOpportunity(ctx, { opportunityId: opportunityId.data, ownerId: ownerId.data });
  } catch (error) {
    return { error: friendly(error) };
  }
  revalidatePath(`/app/${ctx.tenantSlug}/pipeline`, "layout");
  return { ok: true };
}

export async function addNoteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const opportunityId = idSchema.safeParse(formData.get("opportunityId"));
  const body = z.string().trim().min(1).max(5000).safeParse(formData.get("body"));
  if (!opportunityId.success || !body.success) return { error: "Write a note first." };
  const ctx = await requireTenantContext(slugOf(formData));
  try {
    await addOpportunityNote(ctx, { opportunityId: opportunityId.data, body: body.data });
  } catch (error) {
    return { error: friendly(error) };
  }
  revalidatePath(`/app/${ctx.tenantSlug}/pipeline/${opportunityId.data}`);
  return { ok: true };
}

export async function addTaskAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const opportunityId = idSchema.safeParse(formData.get("opportunityId"));
  const title = z.string().trim().min(1).max(200).safeParse(formData.get("title"));
  const due = str(formData, "dueAt");
  const dueAt = due && /^\d{4}-\d{2}-\d{2}$/.test(due) ? `${due}T17:00:00Z` : null;
  if (!opportunityId.success || !title.success) return { error: "Give the task a title." };
  const ctx = await requireTenantContext(slugOf(formData));
  try {
    await addOpportunityTask(ctx, { opportunityId: opportunityId.data, title: title.data, dueAt });
  } catch (error) {
    return { error: friendly(error) };
  }
  revalidatePath(`/app/${ctx.tenantSlug}/pipeline/${opportunityId.data}`);
  return { ok: true };
}

export async function toggleTaskAction(formData: FormData) {
  const taskId = idSchema.safeParse(formData.get("taskId"));
  const opportunityId = idSchema.safeParse(formData.get("opportunityId"));
  if (!taskId.success || !opportunityId.success) return;
  const ctx = await requireTenantContext(slugOf(formData));
  await setTaskCompleted(ctx, { taskId: taskId.data, completed: formData.get("completed") === "true" });
  revalidatePath(`/app/${ctx.tenantSlug}/pipeline/${opportunityId.data}`);
}
