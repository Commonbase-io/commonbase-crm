import { describe, expect, it } from "vitest";
import { computeOverview, median, type OpportunityFact } from "./overview-metrics";

const opp = (o: Partial<OpportunityFact>): OpportunityFact => ({
  stage: "new", estimatedValue: null, sourceCampaignId: null, firstTouchAt: null, qualifiedAt: null, quoteRequestedAt: null, closedAt: null, ...o,
});

const to = new Date("2026-10-20T00:00:00Z");
const from = new Date("2026-09-20T00:00:00Z");

describe("computeOverview", () => {
  const input = {
    opportunities: [
      opp({ stage: "won", estimatedValue: 100, sourceCampaignId: "c1", firstTouchAt: "2026-10-01T00:00:00Z", qualifiedAt: "2026-10-03T00:00:00Z", quoteRequestedAt: "2026-10-05T00:00:00Z", closedAt: "2026-10-10T00:00:00Z" }),
      opp({ stage: "quote_requested", estimatedValue: 50, sourceCampaignId: "c2", firstTouchAt: "2026-10-01T00:00:00Z", qualifiedAt: "2026-10-02T00:00:00Z", quoteRequestedAt: "2026-10-11T00:00:00Z" }),
      opp({ stage: "won", estimatedValue: 999, qualifiedAt: "2026-01-01T00:00:00Z", quoteRequestedAt: "2026-01-02T00:00:00Z", closedAt: "2026-01-03T00:00:00Z" }),
    ],
    activities: [
      { contactId: "p1", campaignId: "c1", eventType: "email_sent", occurredAt: "2026-10-01T00:00:00Z" },
      { contactId: "p1", campaignId: "c1", eventType: "email_sent", occurredAt: "2026-10-04T00:00:00Z" },
      { contactId: "p2", campaignId: "c2", eventType: "email_sent", occurredAt: "2026-10-01T00:00:00Z" },
      { contactId: "p1", campaignId: "c1", eventType: "email_replied", occurredAt: "2026-10-02T00:00:00Z" },
      { contactId: "p1", campaignId: "c1", eventType: "positive_reply", occurredAt: "2026-10-02T00:00:00Z" },
    ],
    contactCreatedAt: ["2026-10-01T00:00:00Z", "2026-01-01T00:00:00Z"],
    from,
    to,
    campaignId: null,
  };

  it("counts only events inside the date range", () => {
    const m = computeOverview(input);
    expect(m.qualifiedConversations).toBe(2);
    expect(m.quoteRequests).toBe(2);
    expect(m.wonDeals).toBe(1);
    expect(m.wonValue).toBe(100);
    expect(m.emailsSent).toBe(3);
    expect(m.positiveReplies).toBe(1);
    expect(m.prospectsAdded).toBe(1);
    expect(m.quoteToWinRate).toBe(0.5);
    expect(m.medianDaysToQuote).toBe(7); // median of 4 and 10
    expect(m.funnel.map((f) => f.value)).toEqual([2, 1, 2, 2, 1]);
  });

  it("filters by campaign", () => {
    const m = computeOverview({ ...input, campaignId: "c1" });
    expect(m.quoteRequests).toBe(1);
    expect(m.emailsSent).toBe(2);
    expect(m.funnel[0]?.value).toBe(1);
  });

  it("returns null rates when there is nothing to divide", () => {
    const m = computeOverview({ ...input, opportunities: [] });
    expect(m.quoteToWinRate).toBeNull();
    expect(m.medianDaysToQuote).toBeNull();
  });

  it("computes medians", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([])).toBeNull();
  });
});
