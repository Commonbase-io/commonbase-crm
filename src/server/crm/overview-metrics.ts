// Pure KPI computation for the overview page, so it is unit tested without a
// database. Optimized for conversations, quotes, and wins, not email volume.

export interface OpportunityFact {
  stage: string;
  estimatedValue: number | null;
  sourceCampaignId: string | null;
  firstTouchAt: string | null;
  qualifiedAt: string | null;
  quoteRequestedAt: string | null;
  closedAt: string | null;
}

export interface ActivityFact {
  contactId: string;
  campaignId: string | null;
  eventType: string;
  occurredAt: string;
}

export interface OverviewInput {
  opportunities: OpportunityFact[];
  activities: ActivityFact[];
  contactCreatedAt: string[];
  from: Date | null;
  to: Date;
  campaignId: string | null;
}

export interface OverviewMetrics {
  qualifiedConversations: number;
  quoteRequests: number;
  wonDeals: number;
  wonValue: number;
  positiveReplies: number;
  prospectsAdded: number;
  emailsSent: number;
  quoteToWinRate: number | null;
  medianDaysToQuote: number | null;
  funnel: { key: string; label: string; value: number }[];
}

const DAY_MS = 86_400_000;

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? (sorted[mid] as number) : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

export function computeOverview(input: OverviewInput): OverviewMetrics {
  const inRange = (iso: string | null): iso is string => {
    if (!iso) return false;
    const t = new Date(iso).getTime();
    return (input.from === null || t >= input.from.getTime()) && t <= input.to.getTime();
  };

  const opportunities = input.campaignId
    ? input.opportunities.filter((o) => o.sourceCampaignId === input.campaignId)
    : input.opportunities;
  const activities = input.campaignId ? input.activities.filter((a) => a.campaignId === input.campaignId) : input.activities;

  const qualified = opportunities.filter((o) => inRange(o.qualifiedAt));
  const quoted = opportunities.filter((o) => inRange(o.quoteRequestedAt));
  const won = opportunities.filter((o) => o.stage === "won" && inRange(o.closedAt));
  const eventsInRange = activities.filter((a) => inRange(a.occurredAt));
  const countEvents = (type: string) => eventsInRange.filter((a) => a.eventType === type).length;
  const distinctContacts = (type: string) => new Set(eventsInRange.filter((a) => a.eventType === type).map((a) => a.contactId)).size;

  const daysToQuote = quoted.flatMap((o) =>
    o.firstTouchAt && o.quoteRequestedAt
      ? [(new Date(o.quoteRequestedAt).getTime() - new Date(o.firstTouchAt).getTime()) / DAY_MS]
      : [],
  );
  const medianDays = median(daysToQuote);

  return {
    qualifiedConversations: qualified.length,
    quoteRequests: quoted.length,
    wonDeals: won.length,
    wonValue: won.reduce((sum, o) => sum + (o.estimatedValue ?? 0), 0),
    positiveReplies: countEvents("positive_reply"),
    // Not campaign-scoped: prospects are added before any campaign exists.
    prospectsAdded: input.contactCreatedAt.filter((c) => inRange(c)).length,
    emailsSent: countEvents("email_sent"),
    quoteToWinRate: quoted.length ? quoted.filter((o) => o.stage === "won").length / quoted.length : null,
    medianDaysToQuote: medianDays === null ? null : Math.round(medianDays * 10) / 10,
    funnel: [
      { key: "contacted", label: "Contacted", value: distinctContacts("email_sent") },
      { key: "replied", label: "Replied", value: distinctContacts("email_replied") },
      { key: "qualified", label: "Qualified", value: qualified.length },
      { key: "quote_requested", label: "Quote requested", value: quoted.length },
      { key: "won", label: "Won", value: won.length },
    ],
  };
}
