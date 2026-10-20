// Campaign state machine. Mirrors app.enforce_campaign_transition() in
// supabase/migrations/*_outreach.sql, which is the backstop; this copy lets
// the UI offer only valid actions and services fail with clear errors.

export const CAMPAIGN_STATUSES = ["draft", "approved", "enrolling", "active", "paused", "completed", "failed"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

const TRANSITIONS: Record<CampaignStatus, readonly CampaignStatus[]> = {
  draft: ["approved"],
  approved: ["draft", "enrolling"],
  enrolling: ["active", "failed"],
  active: ["paused", "completed", "failed"],
  paused: ["active", "completed"],
  failed: ["draft", "enrolling"],
  completed: [],
};

export function canTransition(from: CampaignStatus, to: CampaignStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function isCampaignStatus(value: unknown): value is CampaignStatus {
  return typeof value === "string" && (CAMPAIGN_STATUSES as readonly string[]).includes(value);
}

/** Statuses that accept new enrollments. */
export const ENROLLABLE: readonly CampaignStatus[] = ["approved", "active", "failed"];

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: "Draft",
  approved: "Approved",
  enrolling: "Enrolling",
  active: "Active",
  paused: "Paused",
  completed: "Completed",
  failed: "Failed",
};

export class InvalidTransitionError extends Error {
  constructor(
    readonly from: CampaignStatus,
    readonly to: CampaignStatus,
  ) {
    super(`Cannot move a campaign from ${from} to ${to}`);
    this.name = "InvalidTransitionError";
  }
}

export function assertTransition(from: CampaignStatus, to: CampaignStatus): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}
