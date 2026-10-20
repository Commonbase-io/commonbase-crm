import "server-only";
import { z } from "zod";
import type { TenantContext } from "@/server/auth/tenant-context";
import { assertCan, can, isRole, ROLES, type Role } from "@/server/auth/roles";
import { audit } from "@/server/audit";
import { log } from "@/server/log";
import { createAdminClient } from "@/server/supabase/admin";
import { createUserClient } from "@/server/supabase/server";
import { checkMembershipChange, TEAM_PROBLEM_MESSAGES, type TeamChangeProblem } from "./team-rules";

// Membership writes run as the signed-in admin, so RLS (admins only, never
// yourself) and the keep-an-admin trigger apply. The service role is used only
// for Supabase Auth (invites, account lookups) after assertCan("team.manage").

export interface TeamMember {
  userId: string;
  displayName: string;
  role: Role;
  joinedAt: string;
  /** Admins only: account email and whether they've ever signed in. */
  email?: string | null;
  invited?: boolean;
}

export class TeamChangeError extends Error {
  constructor(readonly problem: TeamChangeProblem | "already_member" | "already_active" | "invite_failed") {
    super(
      problem === "already_member"
        ? "That person is already a member of this workspace."
        : problem === "already_active"
          ? "They've already signed in, so there's no invite to resend."
          : problem === "invite_failed"
          ? "The invite couldn't be sent. Check the email address and try again."
          : TEAM_PROBLEM_MESSAGES[problem],
    );
    this.name = "TeamChangeError";
  }
}

export async function loadTeam(ctx: TenantContext): Promise<TeamMember[]> {
  const supabase = await createUserClient();
  const { data, error } = await supabase
    .from("memberships")
    .select("user_id, role, created_at, profile:profiles!inner(display_name)")
    .eq("tenant_id", ctx.tenantId)
    .order("created_at");
  if (error) throw new Error("Failed to load team");
  const members: TeamMember[] = (data ?? []).flatMap((row) => {
    const profile = Array.isArray(row.profile) ? row.profile[0] : row.profile;
    return isRole(row.role)
      ? [{ userId: row.user_id, displayName: profile?.display_name || "Unnamed user", role: row.role, joinedAt: row.created_at }]
      : [];
  });

  if (can(ctx.role, "team.manage")) {
    const { data: accounts, error: accountsError } = await createAdminClient().rpc("tenant_member_accounts", { p_tenant_id: ctx.tenantId });
    if (accountsError) throw new Error("Failed to load member accounts");
    const byId = new Map((accounts ?? []).map((a) => [a.user_id, a]));
    for (const member of members) {
      const account = byId.get(member.userId);
      member.email = account?.email ?? null;
      member.invited = !account?.last_sign_in_at;
    }
  }
  return members;
}

async function membership(ctx: TenantContext, userId: string) {
  const supabase = await createUserClient();
  const { data, error } = await supabase.from("memberships").select("user_id, role").eq("tenant_id", ctx.tenantId);
  if (error) throw new Error("Failed to load memberships");
  const target = data.find((m) => m.user_id === userId);
  return {
    supabase,
    targetRole: target && isRole(target.role) ? target.role : null,
    adminCount: data.filter((m) => m.role === "tenant_admin").length,
  };
}

const roleSchema = z.enum(ROLES);

export const inviteSchema = z.object({
  email: z.email().max(320).transform((v) => v.trim().toLowerCase()),
  displayName: z.string().trim().max(120).optional(),
  role: roleSchema,
});

/**
 * Adds someone to this tenant. An existing account is added directly; a new
 * address gets a Supabase invite email whose link lets them set a password.
 */
export async function inviteMember(ctx: TenantContext, input: z.infer<typeof inviteSchema>): Promise<"added" | "invited"> {
  assertCan(ctx.role, "team.manage");
  const admin = createAdminClient();
  const supabase = await createUserClient();

  const { data: existingId, error: lookupError } = await admin.rpc("find_auth_user_id", { p_email: input.email });
  if (lookupError) throw new Error("Failed to look up account");

  if (existingId) {
    if (existingId === ctx.userId) throw new TeamChangeError("self");
    const { error } = await supabase.from("memberships").insert({ tenant_id: ctx.tenantId, user_id: existingId, role: input.role });
    if (error?.code === "23505") throw new TeamChangeError("already_member");
    if (error) throw new Error("Failed to add member");
    await audit(ctx, "team.member_added", { userId: existingId, role: input.role });
    return "added";
  }

  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(input.email, {
    data: input.displayName ? { display_name: input.displayName } : undefined,
  });
  if (inviteError || !invited.user) {
    log.warn("invite failed", { code: inviteError?.code ?? "no_user" });
    throw new TeamChangeError("invite_failed");
  }
  const { error } = await supabase.from("memberships").insert({ tenant_id: ctx.tenantId, user_id: invited.user.id, role: input.role });
  if (error) {
    // Don't leave an account with no workspace behind.
    await admin.auth.admin.deleteUser(invited.user.id);
    throw new Error("Failed to add invited member");
  }
  await audit(ctx, "team.member_invited", { userId: invited.user.id, role: input.role });
  return "invited";
}

export async function changeMemberRole(ctx: TenantContext, input: { userId: string; role: Role }) {
  assertCan(ctx.role, "team.manage");
  const { supabase, targetRole, adminCount } = await membership(ctx, input.userId);
  const problem = checkMembershipChange({ actorId: ctx.userId, targetId: input.userId, targetRole, newRole: input.role, adminCount });
  if (problem) throw new TeamChangeError(problem);
  const { data, error } = await supabase
    .from("memberships")
    .update({ role: input.role })
    .eq("tenant_id", ctx.tenantId)
    .eq("user_id", input.userId)
    .select("user_id");
  if (error?.code === "23514") throw new TeamChangeError("last_admin"); // concurrent demotion
  if (error) throw new Error("Failed to change role");
  if (!data.length) throw new TeamChangeError("not_member");
  await audit(ctx, "team.role_changed", { userId: input.userId, from: targetRole, to: input.role });
}

export async function removeMember(ctx: TenantContext, input: { userId: string }) {
  assertCan(ctx.role, "team.manage");
  const { supabase, targetRole, adminCount } = await membership(ctx, input.userId);
  const problem = checkMembershipChange({ actorId: ctx.userId, targetId: input.userId, targetRole, newRole: null, adminCount });
  if (problem) throw new TeamChangeError(problem);
  const { data, error } = await supabase
    .from("memberships")
    .delete()
    .eq("tenant_id", ctx.tenantId)
    .eq("user_id", input.userId)
    .select("user_id");
  if (error?.code === "23514") throw new TeamChangeError("last_admin");
  if (error) throw new Error("Failed to remove member");
  if (!data.length) throw new TeamChangeError("not_member");
  // Their account stays (they may belong to other workspaces); owned deals become unassigned.
  await audit(ctx, "team.member_removed", { userId: input.userId, role: targetRole });
}

/** Re-sends a set-password email to a member who has never signed in. */
export async function resendInvite(ctx: TenantContext, input: { userId: string }) {
  assertCan(ctx.role, "team.manage");
  const { targetRole } = await membership(ctx, input.userId);
  if (!targetRole) throw new TeamChangeError("not_member");
  const admin = createAdminClient();
  const { data: accounts, error } = await admin.rpc("tenant_member_accounts", { p_tenant_id: ctx.tenantId });
  if (error) throw new Error("Failed to load account");
  const account = (accounts ?? []).find((a) => a.user_id === input.userId);
  if (!account?.email || account.last_sign_in_at) throw new TeamChangeError("already_active");
  const { error: sendError } = await admin.auth.resetPasswordForEmail(account.email);
  if (sendError) {
    log.warn("invite resend failed", { code: sendError.code });
    throw new TeamChangeError("invite_failed");
  }
  await audit(ctx, "team.invite_resent", { userId: input.userId });
}
