"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ForbiddenError, ROLES } from "@/server/auth/roles";
import { requireTenantContext } from "@/server/auth/tenant-context";
import { changeMemberRole, inviteMember, inviteSchema, removeMember, resendInvite, TeamChangeError } from "@/server/tenants/team";

// The tenant always comes from the signed-in user's membership; the slug in
// the form only says which of their workspaces is meant.

export interface TeamActionState {
  error?: string;
  ok?: boolean;
  message?: string;
}

const userIdSchema = z.uuid();
const roleSchema = z.enum(ROLES);

async function run(formData: FormData, work: (ctx: Awaited<ReturnType<typeof requireTenantContext>>) => Promise<string>): Promise<TeamActionState> {
  const ctx = await requireTenantContext(String(formData.get("tenantSlug") ?? ""));
  try {
    const message = await work(ctx);
    revalidatePath(`/app/${ctx.tenantSlug}/settings/team`);
    return { ok: true, message };
  } catch (error) {
    if (error instanceof TeamChangeError) return { error: error.message };
    if (error instanceof ForbiddenError) return { error: "Only workspace admins can manage the team." };
    throw error;
  }
}

export async function inviteAction(_prev: TeamActionState, formData: FormData): Promise<TeamActionState> {
  const parsed = inviteSchema.safeParse({
    email: formData.get("email"),
    displayName: formData.get("displayName") || undefined,
    role: formData.get("role"),
  });
  if (!parsed.success) return { error: "Enter a valid email and choose a role." };
  return run(formData, async (ctx) =>
    (await inviteMember(ctx, parsed.data)) === "added"
      ? "Added. They already had an account, so they can sign in now."
      : "Invite sent. They'll get an email to set their password.",
  );
}

export async function changeRoleAction(_prev: TeamActionState, formData: FormData): Promise<TeamActionState> {
  const userId = userIdSchema.safeParse(formData.get("userId"));
  const role = roleSchema.safeParse(formData.get("role"));
  if (!userId.success || !role.success) return { error: "Choose a role." };
  return run(formData, async (ctx) => {
    await changeMemberRole(ctx, { userId: userId.data, role: role.data });
    return "Role updated.";
  });
}

export async function removeAction(_prev: TeamActionState, formData: FormData): Promise<TeamActionState> {
  const userId = userIdSchema.safeParse(formData.get("userId"));
  if (!userId.success) return { error: "Member not found." };
  return run(formData, async (ctx) => {
    await removeMember(ctx, { userId: userId.data });
    return "Removed.";
  });
}

export async function resendAction(_prev: TeamActionState, formData: FormData): Promise<TeamActionState> {
  const userId = userIdSchema.safeParse(formData.get("userId"));
  if (!userId.success) return { error: "Member not found." };
  return run(formData, async (ctx) => {
    await resendInvite(ctx, { userId: userId.data });
    return "Invite email sent again.";
  });
}
