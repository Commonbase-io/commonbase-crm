import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { hashPassword } from "@/lib/auth/password";

export const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL_MIGRATE }),
});

export async function resetDb() {
  await admin.$executeRawUnsafe(
    `TRUNCATE "AuditLog", "Note", "DealContact", "Deal", "Stage", "Pipeline", "Contact", "Company", "LoginAttempt", "Session", "User", "Org" CASCADE`,
  );
}

export async function makeOrg(input: {
  name: string;
  slug: string;
  email: string;
  userName?: string;
  role?: "ADMIN" | "MEMBER";
  isPlatform?: boolean;
  isPlatformAdmin?: boolean;
  mustChangePassword?: boolean;
  password?: string;
}) {
  const org = await admin.org.create({
    data: { name: input.name, slug: input.slug, isPlatform: input.isPlatform ?? false },
  });
  await admin.$executeRaw`SELECT seed_default_pipeline(${org.id}::uuid)`;
  const user = await admin.user.create({
    data: {
      orgId: org.id,
      email: input.email.toLowerCase(),
      name: input.userName ?? input.name,
      passwordHash: await hashPassword(input.password ?? "Password1"),
      role: input.role ?? "ADMIN",
      isPlatformAdmin: input.isPlatformAdmin ?? false,
      mustChangePassword: input.mustChangePassword ?? false,
    },
  });
  return { org, user };
}

export async function call(handler: (request: Request, ctx?: { params?: Promise<Record<string, string>> }) => Promise<Response>, path: string, init?: RequestInit & { cookie?: string; params?: Record<string, string> }) {
  const headers = new Headers(init?.headers);
  if (init?.cookie) headers.set("cookie", init.cookie);
  if (init?.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const response = await handler(new Request(`http://localhost${path}`, { ...init, headers }), {
    params: Promise.resolve(init?.params ?? {}),
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  return { status: response.status, body, cookie: response.headers.get("set-cookie") };
}

export function sessionCookie(setCookie: string | null) {
  const match = setCookie?.match(/crm_session=([^;]+)/);
  if (!match) throw new Error("missing session cookie");
  return `crm_session=${match[1]}`;
}
