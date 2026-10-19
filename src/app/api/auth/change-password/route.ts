import { changePassword, sessionCookie } from "@/lib/auth/session";
import { withApi } from "@/lib/api/handler";
import { json } from "@/lib/http";
import { passwordChangeSchema } from "@/lib/validation";

export const POST = withApi(
  { body: passwordChangeSchema, allowPasswordChange: true },
  async ({ session, body }) => {
    const result = await changePassword(session, body.currentPassword, body.newPassword);
    if (!result.ok) return json({ error: result.error, fieldErrors: result.fieldErrors }, result.status);
    const response = json({ ok: true });
    response.headers.set("set-cookie", sessionCookie(result.token));
    return response;
  },
);
