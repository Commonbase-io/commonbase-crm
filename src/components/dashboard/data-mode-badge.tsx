import { Badge } from "@/components/ui/badge";

/** Shown wherever numbers could be mistaken for real outreach results. */
export function DataModeBadge({ mode }: { mode: "mock" | "live" | "none" }) {
  if (mode === "live") return <Badge tone="success">Live data</Badge>;
  if (mode === "none") return <Badge tone="neutral">No provider connected</Badge>;
  return (
    <Badge tone="warning" title="Synthetic data from the mock provider. No real emails are sent.">
      Demo data
    </Badge>
  );
}
