import { clearSessionCookie, logout } from "@/lib/auth/session";
import { withApi } from "@/lib/api/handler";
import { json } from "@/lib/http";

export const POST = withApi({ auth: "none" }, async ({ request }) => {
  await logout(request);
  const response = json({ ok: true });
  response.headers.set("set-cookie", clearSessionCookie());
  return response;
});
