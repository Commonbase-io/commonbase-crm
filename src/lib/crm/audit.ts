import type { AuditAction } from "@/generated/prisma/client";
import type { Tx } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

export async function writeAudit(
  tx: Tx,
  input: {
    orgId: string;
    actorId: string | null;
    action: AuditAction;
    entityType: string;
    entityId: string;
    metadata?: Record<string, unknown>;
  },
) {
  await tx.auditLog.create({
    data: {
      orgId: input.orgId,
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
    },
  });
}
