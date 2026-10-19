import { archiveContact, getContact, updateContact } from "@/lib/crm/contacts";
import { withApi } from "@/lib/api/handler";
import { json } from "@/lib/http";
import { contactSchema } from "@/lib/validation";

export const GET = withApi({}, async ({ session, params }) => json(await getContact(session, params.id)));

export const PATCH = withApi({ body: contactSchema }, async ({ session, params, body }) => {
  return json(await updateContact(session, params.id, body));
});

export const DELETE = withApi({}, async ({ session, params }) => json(await archiveContact(session, params.id)));
