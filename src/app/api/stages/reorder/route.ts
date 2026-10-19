import { reorderStages } from "@/lib/crm/pipelines";
import { withApi } from "@/lib/api/handler";
import { json } from "@/lib/http";
import { stageReorderSchema } from "@/lib/validation";

export const POST = withApi({ admin: true, body: stageReorderSchema }, async ({ session, body }) => {
  return json(await reorderStages(session, body.stageIds));
});
