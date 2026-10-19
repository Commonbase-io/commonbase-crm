import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/current";
import { getPipeline } from "@/lib/crm/pipelines";
import { StagesPanel } from "@/components/stages-panel";

export default async function PipelineSettingsPage() {
  const session = await requireSession();
  if (session.role !== "ADMIN") notFound();
  const pipeline = await getPipeline(session);
  return (
    <section>
      <div className="page-head">
        <h1>Pipeline stages</h1>
      </div>
      <StagesPanel stages={pipeline.stages} />
    </section>
  );
}
