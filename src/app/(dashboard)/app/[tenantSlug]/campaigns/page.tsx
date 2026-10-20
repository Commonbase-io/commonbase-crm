import type { Metadata } from "next";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { requireTenantContext } from "@/server/auth/tenant-context";

export const metadata: Metadata = { title: "Campaigns" };

export default async function CampaignsPage({ params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;
  await requireTenantContext(tenantSlug);
  return (
    <>
      <PageHeader title="Campaigns" description="Draft sequences, get approval, and enroll contacts after a suppression check." />
      <EmptyState title="Not built yet">This page is part of the next build step (see docs/checklist.md).</EmptyState>
    </>
  );
}
