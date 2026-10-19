import { cookies } from "next/headers";
import { cache } from "react";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, lookupSession, type SessionUser } from "@/lib/auth/session";

export const getSession = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return lookupSession(token);
});

export async function requireSession(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.mustChangePassword) redirect("/change-password");
  return session;
}
