import { archiveDeal, getDeal, updateDeal } from "@/lib/crm/deals";
import { withApi } from "@/lib/api/handler";
import { json } from "@/lib/http";
import { dealUpdateSchema } from "@/lib/validation";

export const GET = withApi({}, async ({ session, params }) => json(await getDeal(session, params.id)));

export const PATCH = withApi({ body: dealUpdateSchema }, async ({ session, params, body }) => {
  return json(await updateDeal(session, params.id, body));
});

export const DELETE = withApi({}, async ({ session, params }) => json(await archiveDeal(session, params.id)));
