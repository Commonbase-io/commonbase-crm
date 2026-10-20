import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/dashboard/action-form";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { can } from "@/server/auth/roles";
import { requireTenantContext } from "@/server/auth/tenant-context";
import { loadMailboxOptions } from "@/server/campaigns/campaigns";
import { createCampaignAction } from "../actions";

export const metadata: Metadata = { title: "New campaign" };

export default async function NewCampaignPage({ params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;
  const ctx = await requireTenantContext(tenantSlug);
  if (!can(ctx.role, "campaign.edit")) {
    return <EmptyState title="Sales managers and admins only">Ask a sales manager to create the campaign.</EmptyState>;
  }
  const { mailboxes } = await loadMailboxOptions(ctx);

  return (
    <>
      <PageHeader title="New campaign" description="Starts as a draft. Nothing is sent until it's approved and contacts are enrolled." />
      {mailboxes.length === 0 ? (
        <EmptyState title="No active mailbox">This workspace needs a connected provider with an active mailbox. See Settings → Integrations.</EmptyState>
      ) : (
        <Card className="max-w-xl p-4">
          <ActionForm action={createCampaignAction} className="space-y-4">
            <input type="hidden" name="tenantSlug" value={ctx.tenantSlug} />
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" required maxLength={200} placeholder="e.g. Upcoming lease expirations" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mailboxId">Send from</Label>
              <Select id="mailboxId" name="mailboxId" required defaultValue={mailboxes[0]?.id}>
                {mailboxes.map((m) => <option key={m.id} value={m.id}>{m.email}</option>)}
              </Select>
            </div>
            <div className="flex items-center gap-3">
              <SubmitButton>Create draft</SubmitButton>
              <Link href={`/app/${ctx.tenantSlug}/campaigns`} className="text-sm text-muted-foreground underline">Cancel</Link>
            </div>
          </ActionForm>
        </Card>
      )}
    </>
  );
}
