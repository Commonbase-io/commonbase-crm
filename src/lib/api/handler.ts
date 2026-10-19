import { getSessionFromRequest, type SessionUser } from "@/lib/auth/session";
import { assertAdmin, assertPlatform } from "@/lib/authz";
import { HttpError, NotFoundError } from "@/lib/errors";
import { errorText } from "@/lib/db";
import { json, notFound, validationFailed } from "@/lib/http";
import { ZodError, type ZodType, type ZodTypeDef } from "zod";

type Config<TBody, TQuery> = {
  body?: ZodType<TBody, ZodTypeDef, unknown>;
  query?: ZodType<TQuery, ZodTypeDef, unknown>;
  auth?: "session" | "none";
  admin?: boolean;
  platform?: boolean;
  allowPasswordChange?: boolean;
};

type Args<TBody, TQuery> = {
  request: Request;
  session: SessionUser;
  body: TBody;
  query: TQuery;
  params: Record<string, string>;
};

export function withApi<TBody = undefined, TQuery = undefined>(
  config: Config<TBody, TQuery>,
  handler: (args: Args<TBody, TQuery>) => Promise<Response>,
) {
  return async (request: Request, context?: { params?: Promise<Record<string, string>> }) => {
    try {
      const params = context?.params ? await context.params : {};
      let session: SessionUser | null = null;
      if (config.auth !== "none") {
        session = await getSessionFromRequest(request);
        if (!session) return json({ error: "Unauthorized" }, 401);
        if (session.mustChangePassword && !config.allowPasswordChange) {
          return json({ error: "Password change required" }, 428);
        }
        if (config.admin) assertAdmin(session);
        if (config.platform) assertPlatform(session);
      }

      let body = undefined as TBody;
      if (config.body) {
        const raw = await request.json().catch(() => ({}));
        const parsed = config.body.safeParse(raw);
        if (!parsed.success) return validationFailed(parsed.error);
        body = parsed.data;
      }

      let query = undefined as TQuery;
      if (config.query) {
        const url = new URL(request.url);
        const parsed = config.query.safeParse(Object.fromEntries(url.searchParams.entries()));
        if (!parsed.success) return validationFailed(parsed.error);
        query = parsed.data;
      }

      return await handler({
        request,
        session: session as SessionUser,
        body,
        query,
        params,
      });
    } catch (error) {
      if (error instanceof NotFoundError) return notFound();
      if (error instanceof HttpError) {
        return json({ error: error.message, fieldErrors: error.fieldErrors, ...error.payload }, error.status);
      }
      if (error instanceof ZodError) return validationFailed(error);
      const text = errorText(error);
      if (text.includes("not_found")) return notFound();
      if (text.includes("email_taken")) {
        return json({ error: "Email is already in use", fieldErrors: { adminEmail: "Email is already in use", email: "Email is already in use" } }, 400);
      }
      if (text.includes("slug_taken")) {
        return json({ error: "Slug is already in use", fieldErrors: { slug: "Slug is already in use" } }, 400);
      }
      console.error(error);
      return json({ error: "Internal error" }, 500);
    }
  };
}
