import { writeAudit } from "@/lib/crm/audit";
import { hashPassword } from "@/lib/auth/password";
import type { SessionUser } from "@/lib/auth/session";
import { assertAdmin } from "@/lib/authz";
import { Prisma } from "@/generated/prisma/client";
import { withOrg } from "@/lib/db";
import { HttpError, NotFoundError } from "@/lib/errors";
import type { UserCreateInput, UserPatchInput } from "@/lib/validation";

const userSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  deactivatedAt: true,
  mustChangePassword: true,
} as const;

export async function listUsers(session: SessionUser, includeDeactivated: boolean) {
  return withOrg(session.orgId, session.id, async (tx) => {
    const users = await tx.user.findMany({
      where: includeDeactivated && session.role === "ADMIN" ? {} : { deactivatedAt: null },
      select: userSelect,
      orderBy: { name: "asc" },
    });
    return users.map((user) => ({
      ...user,
      deactivatedAt: user.deactivatedAt?.toISOString() ?? null,
    }));
  });
}

export async function createUser(session: SessionUser, input: UserCreateInput) {
  assertAdmin(session);
  const passwordHash = await hashPassword(input.password);
  return withOrg(session.orgId, session.id, async (tx) => {
    const existing = await tx.user.findFirst({ where: { email: input.email }, select: { id: true } });
    if (existing) throw new HttpError(400, "Email is already in use", { email: "Email is already in use" });
    try {
      const user = await tx.user.create({
        data: {
          orgId: session.orgId,
          email: input.email,
          name: input.name,
          passwordHash,
          role: input.role,
          mustChangePassword: true,
        },
        select: userSelect,
      });
      await writeAudit(tx, {
        orgId: session.orgId,
        actorId: session.id,
        action: "CREATE",
        entityType: "user",
        entityId: user.id,
        metadata: { role: user.role },
      });
      return { ...user, deactivatedAt: null };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new HttpError(400, "Email is already in use", { email: "Email is already in use" });
      }
      throw error;
    }
  });
}

export async function updateUser(session: SessionUser, id: string, input: UserPatchInput) {
  assertAdmin(session);
  return withOrg(session.orgId, session.id, async (tx) => {
    const user = await tx.user.findFirst({ where: { id } });
    if (!user) throw new NotFoundError();
    if (input.deactivated && user.id === session.id) {
      throw new HttpError(400, "You can't deactivate yourself", { _form: "You can't deactivate yourself" });
    }
    const demotingAdmin = user.role === "ADMIN" && user.deactivatedAt === null && (input.role === "MEMBER" || input.deactivated);
    if (demotingAdmin) {
      const admins = await tx.user.count({ where: { role: "ADMIN", deactivatedAt: null } });
      if (admins <= 1) {
        throw new HttpError(400, "Keep at least one admin", { role: "Keep at least one admin" });
      }
    }
    const updated = await tx.user.update({
      where: { id },
      data: {
        ...(input.role ? { role: input.role } : {}),
        ...(input.deactivated ? { deactivatedAt: new Date() } : {}),
      },
      select: userSelect,
    });
    if (input.deactivated) {
      await tx.$executeRaw`SELECT delete_user_sessions(${id}::uuid)`;
    }
    await writeAudit(tx, {
      orgId: session.orgId,
      actorId: session.id,
      action: "UPDATE",
      entityType: "user",
      entityId: id,
      metadata: { role: updated.role, deactivated: Boolean(input.deactivated) },
    });
    return { ...updated, deactivatedAt: updated.deactivatedAt?.toISOString() ?? null };
  });
}

export async function listActiveOwners(session: SessionUser) {
  const users = await listUsers(session, false);
  return users.map((user) => ({ id: user.id, name: user.name }));
}
