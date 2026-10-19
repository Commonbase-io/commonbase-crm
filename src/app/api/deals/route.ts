import { createDeal, listDeals } from "@/lib/crm/deals";
import { withApi } from "@/lib/api/handler";
import { json } from "@/lib/http";
import { dealSchema, listQuerySchema } from "@/lib/validation";

export const GET = withApi({ query: listQuerySchema }, async ({ session, query }) => json(await listDeals(session, query)));

export const POST = withApi({ body: dealSchema }, async ({ session, body }) => json(await createDeal(session, body), 201));
