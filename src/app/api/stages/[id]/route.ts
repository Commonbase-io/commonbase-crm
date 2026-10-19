import { updateStage } from "@/lib/crm/pipelines";
import { withApi } from "@/lib/api/handler";
import { json } from "@/lib/http";
import { stagePatchSchema } from "@/lib/validation";

export const PATCH = withApi({ admin: true, body: stagePatchSchema }, async ({ session, params, body }) => {
  return json(await updateStage(session, params.id, body));
});
