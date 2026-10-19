import { createCompany, listCompanies } from "@/lib/crm/companies";
import { withApi } from "@/lib/api/handler";
import { json } from "@/lib/http";
import { companySchema, listQuerySchema } from "@/lib/validation";

export const GET = withApi({ query: listQuerySchema }, async ({ session, query }) => {
  return json(await listCompanies(session, query));
});

export const POST = withApi({ body: companySchema }, async ({ session, body }) => {
  return json(await createCompany(session, body), 201);
});
