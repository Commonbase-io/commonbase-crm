import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { z } from "zod";
import { isRole, type Role } from "@/server/auth/roles";
import { requireSessionUser } from "@/server/auth/session";
import { createUserClient } from "@/server/supabase/server";

export interface TenantContext {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  userId: string;
  role: Role;
}

const slugSchema = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(48);

/**
 * Resolves the tenant for a request from the URL slug *and the user's own
 * membership*. The tenant id is never taken from the browser: it comes from a
 * membership row the signed-in user can read under RLS. Non-members get a 404
 * (not 403) so tenant slugs cannot be probed.
 */
export const requireTenantContext = cache(async (tenantSlug: string): Promise<TenantContext> => {
  const slug = slugSchema.safeParse(tenantSlug);
  if (!slug.success) notFound();

  const user = await requireSessionUser();
  const supabase = await createUserClient();
  const { data, error } = await supabase
    .from("memberships")
    .select("role, tenant:tenants!inner(id, slug, name)")
    .eq("user_id", user.id)
    .eq("tenant.slug", slug.data)
    .maybeSingle();

  if (error) throw new Error("Failed to resolve tenant membership");
  if (!data || !isRole(data.role)) notFound();
  const tenant = Array.isArray(data.tenant) ? data.tenant[0] : data.tenant;
  if (!tenant) notFound();

  return { tenantId: tenant.id, tenantSlug: tenant.slug, tenantName: tenant.name, userId: user.id, role: data.role };
});

export interface TenantSummary {
  slug: string;
  name: string;
  role: Role;
}

export async function listMyTenants(): Promise<TenantSummary[]> {
  const user = await requireSessionUser();
  const supabase = await createUserClient();
  const { data, error } = await supabase
    .from("memberships")
    .select("role, tenant:tenants!inner(slug, name)")
    .eq("user_id", user.id);
  if (error) throw new Error("Failed to list tenants");
  return (data ?? []).flatMap((row) => {
    const tenant = Array.isArray(row.tenant) ? row.tenant[0] : row.tenant;
    return tenant && isRole(row.role) ? [{ slug: tenant.slug, name: tenant.name, role: row.role }] : [];
  });
}
