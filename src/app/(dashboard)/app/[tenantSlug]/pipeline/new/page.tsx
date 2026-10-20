import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/dashboard/action-form";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { can } from "@/server/auth/roles";
import { requireTenantContext } from "@/server/auth/tenant-context";
import { loadCompanyOptions } from "@/server/crm/pipeline";
import { loadTeam } from "@/server/tenants/team";
import { createOpportunityAction } from "../actions";

export const metadata: Metadata = { title: "New opportunity" };

export default async function NewOpportunityPage({ params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;
  const ctx = await requireTenantContext(tenantSlug);
  const canAssign = can(ctx.role, "opportunity.reassign");
  const [{ companies, contacts }, team] = await Promise.all([loadCompanyOptions(ctx), canAssign ? loadTeam(ctx) : Promise.resolve([])]);
  const byCompany = new Map(companies.map((c) => [c.id, c.name]));

  return (
    <>
      <PageHeader title="New opportunity" />
      {companies.length === 0 ? (
        <EmptyState title="No companies yet">Save a company from Prospects first.</EmptyState>
      ) : (
        <Card className="max-w-xl p-4">
          <ActionForm action={createOpportunityAction} className="space-y-4">
            <input type="hidden" name="tenantSlug" value={ctx.tenantSlug} />
            <div className="space-y-1.5">
              <Label htmlFor="title">Title</Label>
              <Input id="title" name="title" required maxLength={200} placeholder="e.g. Headquarters move" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="companyId">Company</Label>
              <Select id="companyId" name="companyId" required defaultValue="">
                <option value="" disabled>Choose a company</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contactId">Contact (optional)</Label>
              <Select id="contactId" name="contactId" defaultValue="">
                <option value="">None</option>
                {contacts
                  .filter((c) => byCompany.has(c.companyId))
                  .map((c) => <option key={c.id} value={c.id}>{c.name} · {byCompany.get(c.companyId)}</option>)}
              </Select>
              <p className="text-xs text-muted-foreground">Must work at the chosen company.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="estimatedValue">Estimated value (USD)</Label>
              <Input id="estimatedValue" name="estimatedValue" inputMode="decimal" placeholder="e.g. 25000" />
            </div>
            {canAssign ? (
              <div className="space-y-1.5">
                <Label htmlFor="ownerId">Owner</Label>
                <Select id="ownerId" name="ownerId" defaultValue={ctx.userId}>
                  {team.map((m) => <option key={m.userId} value={m.userId}>{m.displayName}</option>)}
                </Select>
              </div>
            ) : null}
            <div className="flex items-center gap-3">
              <SubmitButton>Create opportunity</SubmitButton>
              <Link href={`/app/${ctx.tenantSlug}/pipeline`} className="text-sm text-muted-foreground underline">Cancel</Link>
            </div>
          </ActionForm>
        </Card>
      )}
    </>
  );
}
