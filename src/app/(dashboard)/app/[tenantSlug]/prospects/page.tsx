import type { Metadata } from "next";
import Link from "next/link";
import { DataModeBadge } from "@/components/dashboard/data-mode-badge";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { SelectAll } from "@/components/dashboard/select-all";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Table, Td, Th } from "@/components/ui/table";
import { formatInteger } from "@/lib/format";
import { can } from "@/server/auth/roles";
import { requireTenantContext } from "@/server/auth/tenant-context";
import { filtersToParams, hasAnyFilter, parseProspectFilters } from "@/server/crm/prospect-filters";
import type { ProspectStatus } from "@/server/crm/prospect-review";
import { loadTenantConfig, searchProspects } from "@/server/crm/prospects";
import { ProviderUnavailableError } from "@/server/providers/errors";
import { triggerEventLabel } from "@/server/tenants/config";
import { saveSelectedProspects } from "./actions";

export const metadata: Metadata = { title: "Prospects" };

const STATUS: Record<ProspectStatus, { label: string; tone: "neutral" | "info" | "success" }> = {
  new: { label: "New", tone: "neutral" },
  company_saved: { label: "Company saved", tone: "info" },
  contact_saved: { label: "Saved", tone: "success" },
};

function parseSaved(value: string | undefined) {
  if (!value || !/^\d+(\.\d+){4}$/.test(value)) return null;
  const [contacts, companies, already, suppressed, customers] = value.split(".").map(Number) as [number, number, number, number, number];
  return { contacts, companies, already, suppressed, customers };
}

export default async function ProspectsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { tenantSlug } = await params;
  const query = await searchParams;
  const ctx = await requireTenantContext(tenantSlug);
  const config = await loadTenantConfig(ctx);
  const filters = parseProspectFilters(query);
  const searched = hasAnyFilter(filters) || query.search === "1";
  const saved = parseSaved(typeof query.saved === "string" ? query.saved : undefined);
  const canSave = can(ctx.role, "crm.write");
  const canEnrich = can(ctx.role, "prospects.enrich");

  let search: Awaited<ReturnType<typeof searchProspects>> | null = null;
  let unavailable: string | null = null;
  if (searched) {
    try {
      search = await searchProspects(ctx, filters);
    } catch (error) {
      if (!(error instanceof ProviderUnavailableError)) throw error;
      unavailable = error.reason;
    }
  }

  return (
    <>
      <PageHeader
        title="Prospects"
        description={
          config.prioritize_trigger_events
            ? "Accounts with a recent or upcoming trigger event are listed first."
            : "Search, review, and save prospects."
        }
        actions={search ? <DataModeBadge mode={search.mode} /> : null}
      />

      <Card className="mb-6 p-4">
        <form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Search filters">
          <input type="hidden" name="search" value="1" />
          <div className="space-y-1.5">
            <Label htmlFor="title">Job titles</Label>
            <Input id="title" name="title" defaultValue={filters.title?.join(", ")} placeholder={config.target_titles.slice(0, 2).join(", ") || "e.g. Facilities Manager"} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="location">Locations</Label>
            <Input id="location" name="location" defaultValue={filters.location?.join(", ")} placeholder="e.g. Springfield" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="industry">Industries</Label>
            <Input id="industry" name="industry" defaultValue={filters.industry?.join(", ")} placeholder="e.g. Software, Legal" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sizeMin">Company size</Label>
            <div className="flex items-center gap-2">
              <Input id="sizeMin" name="sizeMin" inputMode="numeric" pattern="\d*" defaultValue={filters.sizeMin} placeholder="Min" aria-label="Minimum employees" />
              <span className="text-muted-foreground" aria-hidden>–</span>
              <Input id="sizeMax" name="sizeMax" inputMode="numeric" pattern="\d*" defaultValue={filters.sizeMax} placeholder="Max" aria-label="Maximum employees" />
            </div>
          </div>
          {config.trigger_event_types.length ? (
            <fieldset className="space-y-1.5 sm:col-span-2">
              <legend className="text-sm font-medium">Trigger events</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-2 pt-1">
                {config.trigger_event_types.map((type) => (
                  <label key={type} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="trigger" value={type} defaultChecked={filters.trigger?.includes(type)} className="size-4" />
                    {triggerEventLabel(type)}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-3">
            <Button type="submit">Search</Button>
            <Link href={`/app/${ctx.tenantSlug}/prospects`} className="text-sm text-muted-foreground underline">
              Clear
            </Link>
          </div>
        </form>
      </Card>

      {saved ? (
        <p role="status" className="mb-4 rounded-md border border-success/30 bg-success/10 p-3 text-sm">
          Saved {formatInteger(saved.contacts)} contact{saved.contacts === 1 ? "" : "s"} and {formatInteger(saved.companies)} new compan
          {saved.companies === 1 ? "y" : "ies"}.
          {saved.already ? ` ${saved.already} already saved.` : ""}
          {saved.suppressed ? ` ${saved.suppressed} skipped (suppressed).` : ""}
          {saved.customers ? ` ${saved.customers} skipped (existing customer).` : ""}
        </p>
      ) : null}
      {query.error === "select" ? (
        <p role="alert" className="mb-4 text-sm text-danger">Select at least one prospect to save.</p>
      ) : null}

      {!searched ? (
        <EmptyState title="Search for prospects">Use the filters above. Results come from this workspace&apos;s own prospecting connection.</EmptyState>
      ) : unavailable ? (
        <EmptyState title="Prospecting is unavailable">
          {unavailable === "no_connection" || unavailable === "not_connected"
            ? "This workspace has no connected prospecting provider. An admin can check Settings → Integrations."
            : "The prospecting provider can't be used right now. An admin can check Settings → Integrations."}
        </EmptyState>
      ) : search && search.prospects.length === 0 ? (
        <EmptyState title="No matching prospects">Try broader filters.</EmptyState>
      ) : search ? (
        <form action={saveSelectedProspects}>
          <input type="hidden" name="tenantSlug" value={ctx.tenantSlug} />
          {filtersToParams(filters).map(([name, value], i) => (
            <input key={`${name}-${i}`} type="hidden" name={name} value={value} />
          ))}
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              {formatInteger(search.prospects.length)} shown
              {search.excluded.customers + search.excluded.suppressed > 0
                ? ` · ${search.excluded.customers + search.excluded.suppressed} hidden (existing customers or suppressed domains)`
                : ""}
              . Emails aren&apos;t included in search results and aren&apos;t verified until enrichment.
            </p>
            {canSave ? (
              <div className="flex flex-wrap items-center gap-3">
                {canEnrich ? (
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="enrich" className="size-4" /> Enrich emails
                  </label>
                ) : null}
                <Button type="submit" size="sm">Save selected</Button>
              </div>
            ) : null}
          </div>
          <Card>
            <Table aria-label="Prospect results">
              <thead>
                <tr>
                  {canSave ? <Th className="w-10"><SelectAll name="personId" label="Select all prospects" /></Th> : null}
                  <Th>Person</Th>
                  <Th>Company</Th>
                  <Th className="hidden md:table-cell">Size</Th>
                  <Th className="hidden lg:table-cell">Location</Th>
                  <Th>Signals</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {search.prospects.map(({ person, status, relevantTriggers }) => (
                  <tr key={person.externalId}>
                    {canSave ? (
                      <Td>
                        <input
                          type="checkbox"
                          name="personId"
                          value={person.externalId}
                          disabled={status === "contact_saved"}
                          aria-label={`Select ${person.name}`}
                          className="size-4"
                        />
                      </Td>
                    ) : null}
                    <Td>
                      <div className="font-medium">{person.name}</div>
                      <div className="text-xs text-muted-foreground">{person.title ?? "—"}</div>
                    </Td>
                    <Td>
                      <div>{person.company.name}</div>
                      <div className="text-xs text-muted-foreground">{person.company.domain ?? "—"}</div>
                    </Td>
                    <Td className="hidden md:table-cell">{person.company.employeeCount ?? "—"}</Td>
                    <Td className="hidden lg:table-cell">{person.company.location ?? "—"}</Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        {relevantTriggers.length
                          ? relevantTriggers.map((t) => <Badge key={t} tone="warning">{triggerEventLabel(t)}</Badge>)
                          : <span className="text-xs text-muted-foreground">—</span>}
                      </div>
                    </Td>
                    <Td>
                      <Badge tone={STATUS[status].tone}>{STATUS[status].label}</Badge>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </form>
      ) : null}
    </>
  );
}
