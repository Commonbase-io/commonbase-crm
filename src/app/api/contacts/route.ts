import { createContact, listContacts } from "@/lib/crm/contacts";
import { withApi } from "@/lib/api/handler";
import { json } from "@/lib/http";
import { contactCreateSchema, listQuerySchema } from "@/lib/validation";

export const GET = withApi({ query: listQuerySchema }, async ({ session, query }) => json(await listContacts(session, query)));

export const POST = withApi({ body: contactCreateSchema }, async ({ session, body }) => json(await createContact(session, body), 201));
