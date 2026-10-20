import "server-only";
import type { TenantContext } from "@/server/auth/tenant-context";
import { isRole, type Role } from "@/server/auth/roles";
import { createUserClient } from "@/server/supabase/server";

export interface TeamMember {
  userId: string;
  displayName: string;
  role: Role;
  joinedAt: string;
}

export async function loadTeam(ctx: TenantContext): Promise<TeamMember[]> {
  const supabase = await createUserClient();
  const { data, error } = await supabase
    .from("memberships")
    .select("user_id, role, created_at, profile:profiles!inner(display_name)")
    .eq("tenant_id", ctx.tenantId)
    .order("created_at");
  if (error) throw new Error("Failed to load team");
  return (data ?? []).flatMap((row) => {
    const profile = Array.isArray(row.profile) ? row.profile[0] : row.profile;
    return isRole(row.role)
      ? [{ userId: row.user_id, displayName: profile?.display_name || "Unnamed user", role: row.role, joinedAt: row.created_at }]
      : [];
  });
}
