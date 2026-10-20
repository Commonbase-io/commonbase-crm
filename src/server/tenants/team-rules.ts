import type { Role } from "@/server/auth/roles";

// Rules for changing someone's membership. RLS (no self-changes) and the
// memberships_keep_admin trigger enforce the same things in the database;
// this gives clear errors before a write is attempted.

export type TeamChangeProblem = "self" | "last_admin" | "no_change" | "not_member";

export function checkMembershipChange(input: {
  actorId: string;
  targetId: string;
  /** Current role, or null if the target isn't a member of this tenant. */
  targetRole: Role | null;
  /** New role, or null to remove the member. */
  newRole: Role | null;
  adminCount: number;
}): TeamChangeProblem | null {
  if (input.actorId === input.targetId) return "self";
  if (input.targetRole === null) return "not_member";
  if (input.newRole === input.targetRole) return "no_change";
  const losesAdmin = input.targetRole === "tenant_admin" && input.newRole !== "tenant_admin";
  if (losesAdmin && input.adminCount <= 1) return "last_admin";
  return null;
}

export const TEAM_PROBLEM_MESSAGES: Record<TeamChangeProblem, string> = {
  self: "You can't change or remove your own membership. Ask another admin.",
  last_admin: "A workspace must keep at least one admin. Make someone else an admin first.",
  no_change: "They already have that role.",
  not_member: "That person isn't a member of this workspace.",
};
