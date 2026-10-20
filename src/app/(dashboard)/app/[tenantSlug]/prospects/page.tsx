import type { Metadata } from "next";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { requireTenantContext } from "@/server/auth/tenant-context";

export const metadata: Metadata = { title: "Prospects" };

export default async function ProspectsPage({ params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;
  await requireTenantContext(tenantSlug);
  return (
    <>
      <PageHeader title="Prospects" description="Find companies with a recent or upcoming trigger event, then review, deduplicate, and save them." />
      <EmptyState title="Not built yet">This page is part of the next build step (see docs/checklist.md).</EmptyState>
    </>
  );
}
