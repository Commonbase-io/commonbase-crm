import { writeAudit } from "@/lib/crm/audit";
import type { SessionUser } from "@/lib/auth/session";
import { withOrg, type Tx } from "@/lib/db";
import { assertAdmin } from "@/lib/authz";
import { HttpError, NotFoundError } from "@/lib/errors";

async function defaultPipeline(tx: Tx) {
  const pipeline = await tx.pipeline.findFirst({
    where: { isDefault: true, archivedAt: null },
    include: { stages: { where: { archivedAt: null }, orderBy: { position: "asc" } } },
  });
  if (!pipeline) throw new NotFoundError();
  return pipeline;
}

async function lockDefaultPipeline(tx: Tx) {
  await tx.$queryRaw`
    SELECT id FROM "Pipeline"
    WHERE "isDefault" = true AND "archivedAt" IS NULL
    FOR UPDATE
  `;
  return defaultPipeline(tx);
}

export async function getPipeline(session: SessionUser) {
  return withOrg(session.orgId, session.id, async (tx) => {
    const pipeline = await defaultPipeline(tx);
    return {
      id: pipeline.id,
      name: pipeline.name,
      stages: pipeline.stages.map((stage) => ({
        id: stage.id,
        name: stage.name,
        position: stage.position,
        outcome: stage.outcome,
      })),
    };
  });
}

export async function createStage(session: SessionUser, input: { name: string; outcome: "OPEN" | "WON" | "LOST" }) {
  assertAdmin(session);
  return withOrg(session.orgId, session.id, async (tx) => {
    const pipeline = await lockDefaultPipeline(tx);
    const position = pipeline.stages.reduce((max, stage) => Math.max(max, stage.position), -1) + 1;
    const stage = await tx.stage.create({
      data: {
        orgId: session.orgId,
        pipelineId: pipeline.id,
        name: input.name,
        outcome: input.outcome,
        position,
      },
    });
    await writeAudit(tx, {
      orgId: session.orgId,
      actorId: session.id,
      action: "CREATE",
      entityType: "stage",
      entityId: stage.id,
      metadata: { name: stage.name },
    });
    return { id: stage.id, name: stage.name, position: stage.position, outcome: stage.outcome };
  });
}

export async function updateStage(
  session: SessionUser,
  id: string,
  input: { name?: string; outcome?: "OPEN" | "WON" | "LOST"; archived?: boolean },
) {
  assertAdmin(session);
  return withOrg(session.orgId, session.id, async (tx) => {
    const stage = await tx.stage.findFirst({ where: { id, archivedAt: null } });
    if (!stage) throw new NotFoundError();
    if (input.archived) {
      const deals = await tx.deal.count({ where: { stageId: id, archivedAt: null } });
      if (deals > 0) {
        throw new HttpError(400, "Move deals off this stage first", { _form: "Move deals off this stage first" });
      }
      await tx.stage.update({ where: { id }, data: { archivedAt: new Date() } });
      await writeAudit(tx, {
        orgId: session.orgId,
        actorId: session.id,
        action: "DELETE",
        entityType: "stage",
        entityId: id,
      });
      return { ok: true };
    }
    const updated = await tx.stage.update({
      where: { id },
      data: {
        ...(input.name ? { name: input.name } : {}),
        ...(input.outcome ? { outcome: input.outcome } : {}),
      },
    });
    await writeAudit(tx, {
      orgId: session.orgId,
      actorId: session.id,
      action: "UPDATE",
      entityType: "stage",
      entityId: id,
      metadata: { name: updated.name, outcome: updated.outcome },
    });
    return { id: updated.id, name: updated.name, position: updated.position, outcome: updated.outcome };
  });
}

export async function reorderStages(session: SessionUser, stageIds: string[]) {
  assertAdmin(session);
  return withOrg(session.orgId, session.id, async (tx) => {
    const pipeline = await lockDefaultPipeline(tx);
    const currentIds = pipeline.stages.map((stage) => stage.id);
    const same =
      currentIds.length === stageIds.length && currentIds.every((id) => stageIds.includes(id)) && new Set(stageIds).size === stageIds.length;
    if (!same) throw new HttpError(400, "Include every active stage", { stageIds: "Include every active stage" });
    for (let position = 0; position < stageIds.length; position += 1) {
      await tx.stage.update({ where: { id: stageIds[position] }, data: { position } });
    }
    await writeAudit(tx, {
      orgId: session.orgId,
      actorId: session.id,
      action: "UPDATE",
      entityType: "pipeline",
      entityId: pipeline.id,
      metadata: { stageIds },
    });
    const stages = await tx.stage.findMany({
      where: { pipelineId: pipeline.id, archivedAt: null },
      orderBy: { position: "asc" },
    });
    return {
      id: pipeline.id,
      name: pipeline.name,
      stages: stages.map((stage) => ({
        id: stage.id,
        name: stage.name,
        position: stage.position,
        outcome: stage.outcome,
      })),
    };
  });
}
