import { archiveCompany, getCompany, updateCompany } from "@/lib/crm/companies";
import { withApi } from "@/lib/api/handler";
import { json } from "@/lib/http";
import { companySchema } from "@/lib/validation";

export const GET = withApi({}, async ({ session, params }) => json(await getCompany(session, params.id)));

export const PATCH = withApi({ body: companySchema }, async ({ session, params, body }) => {
  return json(await updateCompany(session, params.id, body));
});

export const DELETE = withApi({}, async ({ session, params }) => json(await archiveCompany(session, params.id)));
