import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrisma() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. The app must connect as the crm_app role.");
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

export const prisma = globalForPrisma.prisma ?? createPrisma();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export type Tx = Prisma.TransactionClient;

let roleChecked = false;

export async function assertAppRole(): Promise<void> {
  if (roleChecked) return;
  const rows = await prisma.$queryRaw<Array<{ current_user: string }>>`SELECT current_user`;
  const current = rows[0]?.current_user;
  if (current !== "crm_app") {
    throw new Error(
      `Refusing to query as ${current ?? "unknown"}. DATABASE_URL must use the crm_app role, not a superuser.`,
    );
  }
  roleChecked = true;
}

export async function withOrg<T>(orgId: string, userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  await assertAppRole();
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT set_config('app.org_id', ${orgId}, true)`;
    await tx.$queryRaw`SELECT set_config('app.user_id', ${userId}, true)`;
    return fn(tx);
  });
}

export function isPrismaNotFound(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}

export function errorText(error: unknown): string {
  if (!error) return "";
  if (typeof error === "string") return error;
  if (error instanceof Error) {
    const cause = "cause" in error ? errorText(error.cause) : "";
    return `${error.message} ${cause}`;
  }
  if (typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "";
}
