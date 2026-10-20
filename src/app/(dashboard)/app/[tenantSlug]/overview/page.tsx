import type { Metadata } from "next";
import { DataModeBadge } from "@/components/dashboard/data-mode-badge";
import { Funnel } from "@/components/dashboard/funnel";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { formatCurrency, formatInteger, formatPercent } from "@/lib/format";
import { requireTenantContext } from "@/server/auth/tenant-context";
import { loadOverview, RANGE_OPTIONS, type RangeValue } from "@/server/crm/overview";

export const metadata: Metadata = { title: "Overview" };

const isRange = (value: string | undefined): value is RangeValue => RANGE_OPTIONS.some((r) => r.value === value);
const UUID = /^[0-9a-f-]{36}$/;

export default async function OverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ range?: string; campaign?: string }>;
}) {
  const { tenantSlug } = await params;
  const query = await searchParams;
  const ctx = await requireTenantContext(tenantSlug);
  const range = isRange(query.range) ? query.range : "90d";
  const campaign = query.campaign && UUID.test(query.campaign) ? query.campaign : null;
  const { metrics, campaigns, dataMode } = await loadOverview(ctx, range, campaign);

  return (
    <>
      <PageHeader
        title="Overview"
        description="Conversations, quotes, and wins from outbound."
        actions={
          <>
            <DataModeBadge mode={dataMode} />
            <form className="flex flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor="range">Date range</label>
              <Select id="range" name="range" defaultValue={range} className="w-40">
                {RANGE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </Select>
              <label className="sr-only" htmlFor="campaign">Campaign</label>
              <Select id="campaign" name="campaign" defaultValue={campaign ?? ""} className="w-48">
                <option value="">All campaigns</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
              <Button type="submit" variant="secondary" size="sm">Apply</Button>
            </form>
          </>
        }
      />

      <section aria-label="Primary results" className="grid gap-3 sm:grid-cols-3">
        <KpiCard emphasis label="Qualified conversations" value={formatInteger(metrics.qualifiedConversations)} />
        <KpiCard emphasis label="Quote requests" value={formatInteger(metrics.quoteRequests)} />
        <KpiCard emphasis label="Won deals" value={formatInteger(metrics.wonDeals)} hint={`${formatCurrency(metrics.wonValue)} estimated value`} />
      </section>

      <section aria-label="Activity" className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard label="Quote-to-win rate" value={formatPercent(metrics.quoteToWinRate)} />
        <KpiCard
          label="Median days to quote"
          value={metrics.medianDaysToQuote === null ? "—" : `${metrics.medianDaysToQuote}`}
          hint="First touch to quote request"
        />
        <KpiCard label="Positive replies" value={formatInteger(metrics.positiveReplies)} />
        <KpiCard label="Prospects added" value={formatInteger(metrics.prospectsAdded)} hint="All campaigns" />
        <KpiCard label="Emails sent" value={formatInteger(metrics.emailsSent)} />
      </section>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Funnel</CardTitle>
        </CardHeader>
        <CardContent>
          <Funnel steps={metrics.funnel} />
        </CardContent>
      </Card>
    </>
  );
}
