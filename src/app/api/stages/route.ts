import { createStage } from "@/lib/crm/pipelines";
import { withApi } from "@/lib/api/handler";
import { json } from "@/lib/http";
import { stageCreateSchema } from "@/lib/validation";

export const POST = withApi({ admin: true, body: stageCreateSchema }, async ({ session, body }) => {
  return json(await createStage(session, body), 201);
});
