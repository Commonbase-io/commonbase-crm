import { Badge } from "@/components/ui/badge";
import { CAMPAIGN_STATUS_LABELS, type CampaignStatus } from "@/server/campaigns/state";

const TONE: Record<CampaignStatus, "neutral" | "info" | "success" | "warning" | "danger"> = {
  draft: "neutral",
  approved: "info",
  enrolling: "info",
  active: "success",
  paused: "warning",
  completed: "neutral",
  failed: "danger",
};

export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  return <Badge tone={TONE[status]}>{CAMPAIGN_STATUS_LABELS[status]}</Badge>;
}
