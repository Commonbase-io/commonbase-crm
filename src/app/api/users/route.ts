import { createUser, listUsers } from "@/lib/crm/users";
import { withApi } from "@/lib/api/handler";
import { json } from "@/lib/http";
import { userCreateSchema } from "@/lib/validation";

export const GET = withApi({}, async ({ session }) => json(await listUsers(session, true)));

export const POST = withApi({ admin: true, body: userCreateSchema }, async ({ session, body }) => {
  return json(await createUser(session, body), 201);
});
