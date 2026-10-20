import type { Metadata } from "next";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { requireTenantContext } from "@/server/auth/tenant-context";

export const metadata: Metadata = { title: "Pipeline" };

export default async function PipelinePage({ params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;
  await requireTenantContext(tenantSlug);
  return (
    <>
      <PageHeader title="Pipeline" description="Track opportunities from first touch to won, in kanban and table views." />
      <EmptyState title="Not built yet">This page is part of the next build step (see docs/checklist.md).</EmptyState>
    </>
  );
}
