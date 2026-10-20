import type { Metadata } from "next";
import Link from "next/link";
import { CampaignStatusBadge } from "@/components/dashboard/campaign-status-badge";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, Td, Th } from "@/components/ui/table";
import { formatDate, formatInteger } from "@/lib/format";
import { can } from "@/server/auth/roles";
import { requireTenantContext } from "@/server/auth/tenant-context";
import { listCampaigns } from "@/server/campaigns/campaigns";

export const metadata: Metadata = { title: "Campaigns" };

export default async function CampaignsPage({ params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;
  const ctx = await requireTenantContext(tenantSlug);
  const campaigns = await listCampaigns(ctx);
  const base = `/app/${ctx.tenantSlug}/campaigns`;

  return (
    <>
      <PageHeader
        title="Campaigns"
        description="Every campaign needs explicit approval. Opt-outs are synced and suppression is checked right before each enrollment."
        actions={can(ctx.role, "campaign.edit") ? <Link href={`${base}/new`} className={buttonVariants({ size: "sm" })}>New campaign</Link> : null}
      />
      {campaigns.length === 0 ? (
        <EmptyState title="No campaigns yet">{can(ctx.role, "campaign.edit") ? "Create a draft to get started." : "A sales manager can create one."}</EmptyState>
      ) : (
        <Card>
          <Table aria-label="Campaigns">
            <thead>
              <tr>
                <Th>Campaign</Th>
                <Th>Status</Th>
                <Th className="text-right">Enrolled</Th>
                <Th className="hidden md:table-cell">Mailbox</Th>
                <Th className="hidden md:table-cell">Approved</Th>
                <Th className="hidden lg:table-cell">Updated</Th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id}>
                  <Td><Link href={`${base}/${c.id}`} className="font-medium hover:underline">{c.name}</Link></Td>
                  <Td><CampaignStatusBadge status={c.status} /></Td>
                  <Td className="text-right">{formatInteger(c.enrolled)}</Td>
                  <Td className="hidden break-all md:table-cell">{c.mailboxEmail ?? "—"}</Td>
                  <Td className="hidden md:table-cell">{formatDate(c.approvedAt)}</Td>
                  <Td className="hidden text-muted-foreground lg:table-cell">{formatDate(c.updatedAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </>
  );
}
