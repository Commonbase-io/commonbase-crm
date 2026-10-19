import { clientIp, login, sessionCookie } from "@/lib/auth/session";
import { withApi } from "@/lib/api/handler";
import { json } from "@/lib/http";
import { loginSchema } from "@/lib/validation";

export const POST = withApi({ auth: "none", body: loginSchema }, async ({ request, body }) => {
  const result = await login(body.email, body.password, clientIp(request));
  if (!result.ok) return json({ error: result.error }, result.status);
  const response = json({ user: result.user, mustChangePassword: result.user.mustChangePassword });
  response.headers.set("set-cookie", sessionCookie(result.token));
  return response;
});
