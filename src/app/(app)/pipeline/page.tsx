import { requireSession } from "@/lib/auth/current";
import { getBoard } from "@/lib/crm/deals";
import { PipelineBoard } from "@/components/pipeline-board";

export default async function PipelinePage() {
  const session = await requireSession();
  const board = await getBoard(session);
  return (
    <section>
      <div className="page-head">
        <h1>Pipeline</h1>
      </div>
      <p className="muted">Drag a deal to another stage. If someone else moved it first, the board keeps their stage.</p>
      <PipelineBoard stages={board.stages} deals={board.deals} />
    </section>
  );
}
