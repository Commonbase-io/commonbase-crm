import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { dummyPasswordHash, verifyPassword } from "@/lib/auth/password";

export const SESSION_COOKIE = "crm_session";
const SESSION_SECONDS = 60 * 60 * 24 * 14;
const LOGIN_WINDOW_SECONDS = 15 * 60;
const LOGIN_MAX_FAILURES = 5;
const LOGIN_MAX_IP_FAILURES = 20;

export type SessionUser = {
  id: string;
  orgId: string;
  orgName: string;
  orgIsPlatform: boolean;
  email: string;
  name: string;
  role: "ADMIN" | "MEMBER";
  isPlatformAdmin: boolean;
  mustChangePassword: boolean;
};

type LookupUserRow = {
  user_id: string;
  org_id: string;
  password_hash: string;
  role: "ADMIN" | "MEMBER";
  is_platform_admin: boolean;
  must_change_password: boolean;
  deactivated: boolean;
  org_is_platform: boolean;
  org_name: string;
  user_name: string;
};

type LookupSessionRow = {
  user_id: string;
  org_id: string;
  email: string;
  user_name: string;
  role: "ADMIN" | "MEMBER";
  is_platform_admin: boolean;
  must_change_password: boolean;
  org_is_platform: boolean;
  org_name: string;
};

export function newSessionToken() {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  return { token, tokenHash };
}

export function sessionCookie(token: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_SECONDS}${secure}`;
}

export function clearSessionCookie(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure}`;
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export function clientIp(request: Request): string {
  // A client can prepend any address to X-Forwarded-For. Only a deployment
  // that sets TRUSTED_PROXY_HOPS uses the hop that proxy appended.
  const hops = Number(process.env.TRUSTED_PROXY_HOPS ?? "0");
  if (Number.isInteger(hops) && hops > 0) {
    const parts = (request.headers.get("x-forwarded-for") ?? "")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    const selected = parts[parts.length - hops];
    if (selected) return selected.slice(0, 64);
  }
  return "unknown";
}

function toSession(row: LookupSessionRow): SessionUser {
  return {
    id: row.user_id,
    orgId: row.org_id,
    orgName: row.org_name,
    orgIsPlatform: row.org_is_platform,
    email: row.email,
    name: row.user_name,
    role: row.role,
    isPlatformAdmin: row.is_platform_admin,
    mustChangePassword: row.must_change_password,
  };
}

export async function lookupSession(token: string): Promise<SessionUser | null> {
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const rows = await prisma.$queryRaw<LookupSessionRow[]>`SELECT * FROM lookup_session(${tokenHash})`;
  const row = rows[0];
  return row ? toSession(row) : null;
}

export async function getSessionFromRequest(request: Request): Promise<SessionUser | null> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  return lookupSession(token);
}

async function countRows(rows: Array<{ count: number | null }>): Promise<number> {
  return Number(rows[0]?.count ?? 0);
}

export async function login(email: string, password: string, ip: string) {
  const normalized = email.trim().toLowerCase();
  const limited = { ok: false as const, status: 429 as const, error: "Too many attempts. Try again later." };
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`login:${normalized}`})::bigint)`;
    if (ip !== "unknown") {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`login-ip:${ip}`})::bigint)`;
    }
    const emailFailures = await countRows(
      await tx.$queryRaw<Array<{ count: number }>>`SELECT failed_login_count(${normalized}, ${LOGIN_WINDOW_SECONDS}) AS count`,
    );
    if (emailFailures >= LOGIN_MAX_FAILURES) return limited;
    if (ip !== "unknown") {
      const ipFailures = await countRows(
        await tx.$queryRaw<Array<{ count: number }>>`SELECT failed_login_count_ip(${ip}, ${LOGIN_WINDOW_SECONDS}) AS count`,
      );
      if (ipFailures >= LOGIN_MAX_IP_FAILURES) return limited;
    }

    const users = await tx.$queryRaw<LookupUserRow[]>`SELECT * FROM lookup_user_by_email(${normalized})`;
    const user = users[0];
    const hash = user?.password_hash ?? (await dummyPasswordHash());
    const valid = await verifyPassword(hash, password);
    if (!user || !valid || user.deactivated) {
      await tx.$executeRaw`SELECT record_login_attempt(${normalized}, ${ip}, false)`;
      return { ok: false as const, status: 401 as const, error: "Invalid email or password." };
    }

    await tx.$executeRaw`SELECT record_login_attempt(${normalized}, ${ip}, true)`;
    const { token, tokenHash } = newSessionToken();
    const expires = new Date(Date.now() + SESSION_SECONDS * 1000);
    await tx.$executeRaw`SELECT create_session(${user.user_id}::uuid, ${tokenHash}, ${expires})`;
    return {
      ok: true as const,
      token,
      user: {
        id: user.user_id,
        email: normalized,
        name: user.user_name,
        role: user.role,
        mustChangePassword: user.must_change_password,
      },
    };
  }, { timeout: 20_000 });
}

export async function logout(request: Request): Promise<void> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await prisma.$executeRaw`SELECT delete_session(${tokenHash})`;
}

export async function changePassword(session: SessionUser, currentPassword: string, newPassword: string) {
  const users = await prisma.$queryRaw<LookupUserRow[]>`SELECT * FROM lookup_user_by_email(${session.email})`;
  const user = users[0];
  if (!user || user.user_id !== session.id) {
    return { ok: false as const, status: 401, error: "Invalid email or password." };
  }
  const valid = await verifyPassword(user.password_hash, currentPassword);
  if (!valid) {
    return {
      ok: false as const,
      status: 400,
      error: "Current password is wrong",
      fieldErrors: { currentPassword: "Current password is wrong" },
    };
  }
  const { hashPassword } = await import("@/lib/auth/password");
  const nextHash = await hashPassword(newPassword);
  const { withOrg } = await import("@/lib/db");
  const { writeAudit } = await import("@/lib/crm/audit");
  const { token, tokenHash } = newSessionToken();
  const expires = new Date(Date.now() + SESSION_SECONDS * 1000);
  await withOrg(session.orgId, session.id, async (tx) => {
    await tx.user.update({
      where: { id: session.id },
      data: { passwordHash: nextHash, mustChangePassword: false },
    });
    await tx.$executeRaw`SELECT delete_user_sessions(${session.id}::uuid)`;
    await tx.$executeRaw`SELECT create_session(${session.id}::uuid, ${tokenHash}, ${expires})`;
    await writeAudit(tx, {
      orgId: session.orgId,
      actorId: session.id,
      action: "UPDATE",
      entityType: "user",
      entityId: session.id,
      metadata: { passwordChanged: true },
    });
  });
  return { ok: true as const, token };
}
