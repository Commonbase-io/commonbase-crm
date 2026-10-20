import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { StageMover } from "@/components/dashboard/stage-mover";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, Td, Th } from "@/components/ui/table";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { requireTenantContext } from "@/server/auth/tenant-context";
import { loadPipeline, type OpportunityCard } from "@/server/crm/pipeline";
import { OPPORTUNITY_STAGES, STAGE_LABELS } from "@/server/crm/stages";
import { moveStageAction } from "./actions";

export const metadata: Metadata = { title: "Pipeline" };

function Toggle({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn("rounded-md px-3 py-1.5 text-sm", active ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground")}
    >
      {children}
    </Link>
  );
}

export default async function PipelinePage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ view?: string; owner?: string }>;
}) {
  const { tenantSlug } = await params;
  const query = await searchParams;
  const ctx = await requireTenantContext(tenantSlug);
  const view = query.view === "table" ? "table" : "board";
  const owner = query.owner === "me" ? "me" : "all";
  const { opportunities } = await loadPipeline(ctx, { owner });
  const base = `/app/${ctx.tenantSlug}/pipeline`;
  const href = (next: { view?: string; owner?: string }) => `${base}?${new URLSearchParams({ view, owner, ...next })}`;

  const byStage = new Map(OPPORTUNITY_STAGES.map((s) => [s, [] as OpportunityCard[]]));
  for (const o of opportunities) byStage.get(o.stage)?.push(o);
  const openValue = opportunities.filter((o) => o.stage !== "won" && o.stage !== "lost").reduce((sum, o) => sum + (o.estimatedValue ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Pipeline"
        description={`${opportunities.length} opportunities · ${formatCurrency(openValue)} open`}
        actions={
          <>
            <nav aria-label="View" className="flex rounded-lg border bg-surface p-0.5">
              <Toggle href={href({ view: "board" })} active={view === "board"}>Board</Toggle>
              <Toggle href={href({ view: "table" })} active={view === "table"}>Table</Toggle>
            </nav>
            <nav aria-label="Owner" className="flex rounded-lg border bg-surface p-0.5">
              <Toggle href={href({ owner: "all" })} active={owner === "all"}>Everyone</Toggle>
              <Toggle href={href({ owner: "me" })} active={owner === "me"}>Mine</Toggle>
            </nav>
            <Link href={`${base}/new`} className={buttonVariants({ size: "sm" })}>New opportunity</Link>
          </>
        }
      />

      {opportunities.length === 0 ? (
        <EmptyState title="No opportunities yet">Create one from a saved company, or switch the owner filter to Everyone.</EmptyState>
      ) : view === "board" ? (
        <div className="-mx-4 overflow-x-auto px-4 pb-4 md:-mx-8 md:px-8">
          <div className="flex items-start gap-3">
            {OPPORTUNITY_STAGES.map((stage) => {
              const items = byStage.get(stage) ?? [];
              return (
                // Empty stages stay narrow so the busy ones fit on screen.
                <section
                  key={stage}
                  aria-label={STAGE_LABELS[stage]}
                  className={cn("flex min-h-40 shrink-0 flex-col rounded-lg bg-muted/60 p-2", items.length ? "w-64" : "w-32")}
                >
                  <header className="flex items-baseline justify-between px-1 pb-2">
                    <h2 className="text-xs font-semibold">{STAGE_LABELS[stage]}</h2>
                    <span className="text-xs text-muted-foreground">
                      {items.length}
                      {items.length ? ` · ${formatCurrency(items.reduce((s, o) => s + (o.estimatedValue ?? 0), 0))}` : ""}
                    </span>
                  </header>
                  <ul className="space-y-2">
                    {items.map((o) => (
                      <li key={o.id}>
                        <Card className="space-y-2 p-3">
                          <div>
                            <Link href={`${base}/${o.id}`} className="text-sm font-medium hover:underline">{o.title}</Link>
                            <p className="text-xs text-muted-foreground">{o.company?.name ?? "—"}</p>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span>{o.estimatedValue === null ? "—" : formatCurrency(o.estimatedValue)}</span>
                            <span className="text-muted-foreground">{o.owner?.name ?? "Unassigned"}</span>
                          </div>
                          {o.stage === "lost" && o.lostReason ? <p className="text-xs text-muted-foreground">Lost: {o.lostReason}</p> : null}
                          {o.editable ? (
                            <StageMover action={moveStageAction} tenantSlug={ctx.tenantSlug} opportunityId={o.id} stage={o.stage} compact />
                          ) : null}
                        </Card>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </div>
      ) : (
        <Card>
          <Table aria-label="Opportunities">
            <thead>
              <tr>
                <Th>Opportunity</Th>
                <Th>Stage</Th>
                <Th className="text-right">Value</Th>
                <Th className="hidden md:table-cell">Owner</Th>
                <Th className="hidden lg:table-cell">Source campaign</Th>
                <Th className="hidden lg:table-cell">Quote requested</Th>
                <Th className="w-64">Move</Th>
              </tr>
            </thead>
            <tbody>
              {opportunities.map((o) => (
                <tr key={o.id}>
                  <Td>
                    <Link href={`${base}/${o.id}`} className="font-medium hover:underline">{o.title}</Link>
                    <div className="text-xs text-muted-foreground">{o.company?.name ?? "—"}</div>
                  </Td>
                  <Td>
                    {STAGE_LABELS[o.stage]}
                    {o.stage === "lost" && o.lostReason ? <div className="text-xs text-muted-foreground">{o.lostReason}</div> : null}
                  </Td>
                  <Td className="text-right">{o.estimatedValue === null ? "—" : formatCurrency(o.estimatedValue)}</Td>
                  <Td className="hidden md:table-cell">{o.owner?.name ?? "Unassigned"}</Td>
                  <Td className="hidden lg:table-cell">{o.sourceCampaign?.name ?? "—"}</Td>
                  <Td className="hidden lg:table-cell">{formatDate(o.quoteRequestedAt)}</Td>
                  <Td>
                    {o.editable ? (
                      <StageMover action={moveStageAction} tenantSlug={ctx.tenantSlug} opportunityId={o.id} stage={o.stage} compact />
                    ) : (
                      <span className="text-xs text-muted-foreground">Owner or manager only</span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </>
  );
}
