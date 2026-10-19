import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, lookupSession } from "@/lib/auth/session";

function redirectTo(request: NextRequest, pathname: string) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  if (pathname === "/login") url.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api") || pathname === "/favicon.ico") {
    return NextResponse.next();
  }
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    if (pathname === "/login") return NextResponse.next();
    return redirectTo(request, "/login");
  }
  const session = await lookupSession(token);
  if (!session) {
    if (pathname === "/login") return NextResponse.next();
    return redirectTo(request, "/login");
  }
  if (session.mustChangePassword && pathname !== "/change-password") {
    return redirectTo(request, "/change-password");
  }
  if (pathname === "/login") {
    return redirectTo(request, "/companies");
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
