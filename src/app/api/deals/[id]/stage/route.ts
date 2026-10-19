import { moveDealStage } from "@/lib/crm/deals";
import { withApi } from "@/lib/api/handler";
import { json } from "@/lib/http";
import { stageMoveSchema } from "@/lib/validation";

export const POST = withApi({ body: stageMoveSchema }, async ({ session, params, body }) => {
  return json(await moveDealStage(session, params.id, body.stageId, body.expectedStageId));
});
