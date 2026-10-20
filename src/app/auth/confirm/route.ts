import { NextResponse, type NextRequest } from "next/server";
import { log } from "@/server/log";
import { createUserClient } from "@/server/supabase/server";

// Target of invite and password-reset emails (supabase/templates/*.html).
// Verifies the one-time token server-side, which sets the session cookie, then
// continues to a same-origin path only.

const TYPES = new Set(["invite", "recovery"]);

function safeNext(value: string | null): string {
  // Relative paths only: no scheme, no protocol-relative "//host", no backslashes.
  return value && value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") ? value : "/app";
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const next = safeNext(url.searchParams.get("next"));
  const redirectTo = (path: string) => NextResponse.redirect(new URL(path, url.origin));

  if (!tokenHash || !type || !TYPES.has(type)) return redirectTo("/login?error=link");

  const supabase = await createUserClient();
  const { error } = await supabase.auth.verifyOtp({ type: type as "invite" | "recovery", token_hash: tokenHash });
  if (error) {
    log.warn("email link verification failed", { code: error.code ?? "unknown" });
    return redirectTo("/login?error=link");
  }
  return redirectTo(next);
}
