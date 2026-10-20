// Shared by server and client components (no server-only imports).

export const OPPORTUNITY_STAGES = [
  "new",
  "contacted",
  "interested",
  "qualified",
  "quote_requested",
  "proposal_sent",
  "won",
  "lost",
] as const;

export type OpportunityStage = (typeof OPPORTUNITY_STAGES)[number];

export const STAGE_LABELS: Record<OpportunityStage, string> = {
  new: "New",
  contacted: "Contacted",
  interested: "Interested",
  qualified: "Qualified",
  quote_requested: "Quote requested",
  proposal_sent: "Proposal sent",
  won: "Won",
  lost: "Lost",
};

export function isStage(value: unknown): value is OpportunityStage {
  return typeof value === "string" && (OPPORTUNITY_STAGES as readonly string[]).includes(value);
}
