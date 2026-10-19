import { updateUser } from "@/lib/crm/users";
import { withApi } from "@/lib/api/handler";
import { json } from "@/lib/http";
import { userPatchSchema } from "@/lib/validation";

export const PATCH = withApi({ admin: true, body: userPatchSchema }, async ({ session, params, body }) => {
  return json(await updateUser(session, params.id, body));
});
