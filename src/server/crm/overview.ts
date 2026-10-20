import "server-only";
import type { TenantContext } from "@/server/auth/tenant-context";
import { createUserClient } from "@/server/supabase/server";
import { computeOverview, type OverviewMetrics } from "./overview-metrics";

export const RANGE_OPTIONS = [
  { value: "30d", label: "Last 30 days", days: 30 },
  { value: "90d", label: "Last 90 days", days: 90 },
  { value: "all", label: "All time", days: null },
] as const;
export type RangeValue = (typeof RANGE_OPTIONS)[number]["value"];

export interface OverviewData {
  metrics: OverviewMetrics;
  campaigns: { id: string; name: string }[];
  dataMode: "mock" | "live" | "none";
}

// Runs as the signed-in user, so RLS limits every read to their tenant; the
// explicit tenant filter keeps multi-tenant users (Commonbase staff) scoped to
// the tenant in the URL.
export async function loadOverview(ctx: TenantContext, range: RangeValue, campaignId: string | null): Promise<OverviewData> {
  const supabase = await createUserClient();
  const option = RANGE_OPTIONS.find((r) => r.value === range) ?? RANGE_OPTIONS[0];
  const to = new Date();
  const from = option.days === null ? null : new Date(to.getTime() - option.days * 86_400_000);

  const [opps, activities, contacts, campaigns, connection] = await Promise.all([
    supabase
      .from("opportunities")
      .select("stage, estimated_value, source_campaign_id, first_touch_at, qualified_at, quote_requested_at, closed_at")
      .eq("tenant_id", ctx.tenantId),
    supabase.from("activities").select("contact_id, campaign_id, event_type, occurred_at").eq("tenant_id", ctx.tenantId),
    supabase.from("contacts").select("created_at").eq("tenant_id", ctx.tenantId),
    supabase.from("campaigns").select("id, name").eq("tenant_id", ctx.tenantId).order("created_at"),
    supabase
      .from("provider_connections")
      .select("mode, status")
      .eq("tenant_id", ctx.tenantId)
      .in("status", ["pending", "connected"])
      .maybeSingle(),
  ]);
  for (const result of [opps, activities, contacts, campaigns, connection]) {
    if (result.error) throw new Error("Failed to load overview data");
  }

  const validCampaign = campaignId && campaigns.data?.some((c) => c.id === campaignId) ? campaignId : null;

  const metrics = computeOverview({
    opportunities: (opps.data ?? []).map((o) => ({
      stage: o.stage,
      estimatedValue: o.estimated_value === null ? null : Number(o.estimated_value),
      sourceCampaignId: o.source_campaign_id,
      firstTouchAt: o.first_touch_at,
      qualifiedAt: o.qualified_at,
      quoteRequestedAt: o.quote_requested_at,
      closedAt: o.closed_at,
    })),
    activities: (activities.data ?? []).map((a) => ({
      contactId: a.contact_id,
      campaignId: a.campaign_id,
      eventType: a.event_type,
      occurredAt: a.occurred_at,
    })),
    contactCreatedAt: (contacts.data ?? []).map((c) => c.created_at),
    from,
    to,
    campaignId: validCampaign,
  });

  const isLive = connection.data?.mode === "live" && connection.data.status === "connected";
  return {
    metrics,
    campaigns: campaigns.data ?? [],
    dataMode: connection.data ? (isLive ? "live" : "mock") : "none",
  };
}
