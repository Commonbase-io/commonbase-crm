import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/current";
import { getPipeline } from "@/lib/crm/pipelines";
import { StagesPanel } from "@/components/stages-panel";

export default async function PipelineSettingsPage() {
  const session = await requireSession();
  if (session.role !== "ADMIN") notFound();
  const pipeline = await getPipeline(session);
  return <StagesPanel stages={pipeline.stages} />;
}
