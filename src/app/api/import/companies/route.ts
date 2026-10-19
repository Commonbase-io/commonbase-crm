import { importCompanies } from "@/lib/crm/import-rows";
import { withApi } from "@/lib/api/handler";
import { json } from "@/lib/http";
import { importSchema } from "@/lib/validation";

export const POST = withApi({ body: importSchema }, async ({ session, body }) => json(await importCompanies(session, body)));
