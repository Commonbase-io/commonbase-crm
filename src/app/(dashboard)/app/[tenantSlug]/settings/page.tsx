import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireTenantContext } from "@/server/auth/tenant-context";
import { createUserClient } from "@/server/supabase/server";

export const metadata: Metadata = { title: "Settings" };

export default async function GeneralSettingsPage({ params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;
  const ctx = await requireTenantContext(tenantSlug);
  const supabase = await createUserClient();
  const { data: tenant, error } = await supabase.from("tenants").select("name, slug, postal_address").eq("id", ctx.tenantId).single();
  if (error) throw new Error("Failed to load tenant");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Workspace</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-4 text-sm sm:grid-cols-[12rem_1fr]">
          <dt className="text-muted-foreground">Name</dt>
          <dd>{tenant.name}</dd>
          <dt className="text-muted-foreground">Slug</dt>
          <dd className="font-mono text-xs">{tenant.slug}</dd>
          <dt className="text-muted-foreground">Sender postal address</dt>
          <dd>
            {tenant.postal_address ?? <span className="text-danger">Missing. Campaigns cannot be approved until this is set.</span>}
          </dd>
        </dl>
      </CardContent>
    </Card>
  );
}
