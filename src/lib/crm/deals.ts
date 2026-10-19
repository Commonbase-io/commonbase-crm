import { outcomeToStatus, type BoardDeal, type BoardStage } from "@/lib/crm/board";
import { writeAudit } from "@/lib/crm/audit";
import type { SessionUser } from "@/lib/auth/session";
import { isPrismaNotFound, withOrg, type Tx } from "@/lib/db";
import { ConflictError, HttpError, NotFoundError } from "@/lib/errors";
import { dollarsToCents } from "@/lib/money";
import type { DealInput, DealUpdateInput, ListQuery } from "@/lib/validation";

function closeDate(value: string | null): Date | null {
  if (!value) return null;
  return new Date(`${value}T00:00:00.000Z`);
}

function formatClose(value: Date | null): string | null {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}

function serializeBoardDeal(deal: {
  id: string;
  name: string;
  stageId: string;
  amountCents: number;
  currency: string;
  status: "OPEN" | "WON" | "LOST";
  expectedCloseDate: Date | null;
  company: { name: string } | null;
  owner: { name: string };
}): BoardDeal {
  return {
    id: deal.id,
    name: deal.name,
    stageId: deal.stageId,
    amountCents: deal.amountCents,
    currency: deal.currency,
    status: deal.status,
    companyName: deal.company?.name ?? null,
    ownerName: deal.owner.name,
    expectedCloseDate: formatClose(deal.expectedCloseDate),
  };
}

async function resolveOwner(tx: Tx, session: SessionUser, ownerId?: string) {
  const id = ownerId || session.id;
  const owner = await tx.user.findFirst({ where: { id, deactivatedAt: null }, select: { id: true } });
  if (!owner) throw new HttpError(400, "Choose an owner", { ownerId: "Choose an active user in this organization" });
  return owner.id;
}

async function assertContacts(tx: Tx, contactIds: string[]) {
  if (contactIds.length === 0) return;
  const found = await tx.contact.findMany({
    where: { id: { in: contactIds }, archivedAt: null },
    select: { id: true },
  });
  if (found.length !== new Set(contactIds).size) throw new NotFoundError();
}

async function replaceContacts(tx: Tx, orgId: string, dealId: string, contactIds: string[]) {
  await assertContacts(tx, contactIds);
  await tx.dealContact.deleteMany({ where: { dealId } });
  if (contactIds.length) {
    await tx.dealContact.createMany({
      data: [...new Set(contactIds)].map((contactId) => ({ orgId, dealId, contactId })),
    });
  }
}

const dealListSelect = {
  id: true,
  name: true,
  amountCents: true,
  currency: true,
  status: true,
  stageId: true,
  companyId: true,
  ownerId: true,
  expectedCloseDate: true,
  stage: { select: { id: true, name: true } },
  company: { select: { id: true, name: true } },
  owner: { select: { id: true, name: true } },
} as const;

export async function listDeals(session: SessionUser, query: ListQuery) {
  return withOrg(session.orgId, session.id, async (tx) => {
    const where = {
      archivedAt: null,
      ...(query.ownerId ? { ownerId: query.ownerId } : {}),
      ...(query.stageId ? { stageId: query.stageId } : {}),
      ...(query.companyId ? { companyId: query.companyId } : {}),
      ...(query.q ? { name: { contains: query.q, mode: "insensitive" as const } } : {}),
    };
    const [rows, total] = await Promise.all([
      tx.deal.findMany({
        where,
        select: dealListSelect,
        orderBy: { updatedAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      tx.deal.count({ where }),
    ]);
    return {
      items: rows.map((deal) => ({ ...deal, expectedCloseDate: formatClose(deal.expectedCloseDate) })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  });
}

export async function getDeal(session: SessionUser, id: string) {
  return withOrg(session.orgId, session.id, async (tx) => {
    const deal = await tx.deal.findFirst({
      where: { id, archivedAt: null },
      select: {
        ...dealListSelect,
        dealContacts: {
          select: { contact: { select: { id: true, firstName: true, lastName: true, email: true } } },
        },
        noteRows: {
          where: { archivedAt: null },
          select: { id: true, body: true, createdAt: true, author: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (!deal) throw new NotFoundError();
    return {
      ...deal,
      expectedCloseDate: formatClose(deal.expectedCloseDate),
      contacts: deal.dealContacts.map((link) => link.contact),
      activity: deal.noteRows.map((note) => ({
        id: note.id,
        body: note.body,
        createdAt: note.createdAt.toISOString(),
        authorName: note.author.name,
      })),
    };
  });
}

export async function createDeal(session: SessionUser, input: DealInput) {
  const amountCents = dollarsToCents(input.amount);
  if (amountCents === null) {
    throw new HttpError(400, "Enter a dollar amount", { amount: "Enter a dollar amount with up to 2 decimal places" });
  }
  return withOrg(session.orgId, session.id, async (tx) => {
    const stage = await tx.stage.findFirst({ where: { id: input.stageId, archivedAt: null } });
    if (!stage) throw new NotFoundError();
    if (input.companyId) {
      const company = await tx.company.findFirst({ where: { id: input.companyId, archivedAt: null }, select: { id: true } });
      if (!company) throw new NotFoundError();
    }
    const ownerId = await resolveOwner(tx, session, input.ownerId);
    const deal = await tx.deal.create({
      data: {
        orgId: session.orgId,
        name: input.name,
        amountCents,
        currency: input.currency,
        stageId: stage.id,
        companyId: input.companyId,
        ownerId,
        expectedCloseDate: closeDate(input.expectedCloseDate),
        status: outcomeToStatus(stage.outcome),
      },
      select: { id: true },
    });
    await replaceContacts(tx, session.orgId, deal.id, input.contactIds);
    await writeAudit(tx, {
      orgId: session.orgId,
      actorId: session.id,
      action: "CREATE",
      entityType: "deal",
      entityId: deal.id,
      metadata: { name: input.name, stageId: stage.id },
    });
    return getDealInTx(tx, deal.id);
  });
}

async function getDealInTx(tx: Tx, id: string) {
  const deal = await tx.deal.findFirst({
    where: { id, archivedAt: null },
    select: dealListSelect,
  });
  if (!deal) throw new NotFoundError();
  return { ...deal, expectedCloseDate: formatClose(deal.expectedCloseDate) };
}

export async function updateDeal(session: SessionUser, id: string, input: DealUpdateInput) {
  const amountCents = dollarsToCents(input.amount);
  if (amountCents === null) {
    throw new HttpError(400, "Enter a dollar amount", { amount: "Enter a dollar amount with up to 2 decimal places" });
  }
  return withOrg(session.orgId, session.id, async (tx) => {
    const current = await tx.deal.findFirst({ where: { id, archivedAt: null }, select: { id: true } });
    if (!current) throw new NotFoundError();
    if (input.companyId) {
      const company = await tx.company.findFirst({ where: { id: input.companyId, archivedAt: null }, select: { id: true } });
      if (!company) throw new NotFoundError();
    }
    const ownerId = await resolveOwner(tx, session, input.ownerId);
    try {
      await tx.deal.update({
        where: { id },
        data: {
          name: input.name,
          amountCents,
          currency: input.currency,
          companyId: input.companyId,
          ownerId,
          expectedCloseDate: closeDate(input.expectedCloseDate),
        },
      });
    } catch (error) {
      if (isPrismaNotFound(error)) throw new NotFoundError();
      throw error;
    }
    await replaceContacts(tx, session.orgId, id, input.contactIds);
    await writeAudit(tx, {
      orgId: session.orgId,
      actorId: session.id,
      action: "UPDATE",
      entityType: "deal",
      entityId: id,
      metadata: { name: input.name },
    });
    return getDealInTx(tx, id);
  });
}

export async function archiveDeal(session: SessionUser, id: string) {
  return withOrg(session.orgId, session.id, async (tx) => {
    const current = await tx.deal.findFirst({ where: { id, archivedAt: null }, select: { id: true } });
    if (!current) throw new NotFoundError();
    await tx.deal.update({ where: { id }, data: { archivedAt: new Date() } });
    await writeAudit(tx, {
      orgId: session.orgId,
      actorId: session.id,
      action: "DELETE",
      entityType: "deal",
      entityId: id,
    });
    return { ok: true };
  });
}

export async function moveDealStage(session: SessionUser, dealId: string, stageId: string, expectedStageId: string) {
  return withOrg(session.orgId, session.id, async (tx) => {
    const stage = await tx.stage.findFirst({ where: { id: stageId, archivedAt: null } });
    if (!stage) throw new NotFoundError();
    const status = outcomeToStatus(stage.outcome);
    const updated = await tx.deal.updateMany({
      where: { id: dealId, stageId: expectedStageId, archivedAt: null },
      data: { stageId, status },
    });
    if (updated.count !== 1) {
      const current = await tx.deal.findFirst({
        where: { id: dealId, archivedAt: null },
        include: { company: true, owner: true },
      });
      if (!current) throw new NotFoundError();
      throw new ConflictError("This deal was moved already", { deal: serializeBoardDeal(current) });
    }
    const deal = await tx.deal.findFirst({
      where: { id: dealId },
      include: { company: true, owner: true },
    });
    if (!deal) throw new NotFoundError();
    await writeAudit(tx, {
      orgId: session.orgId,
      actorId: session.id,
      action: "UPDATE",
      entityType: "deal",
      entityId: dealId,
      metadata: { fromStageId: expectedStageId, stageId, status },
    });
    return serializeBoardDeal(deal);
  });
}

export async function getBoard(session: SessionUser) {
  return withOrg(session.orgId, session.id, async (tx) => {
    const pipeline = await tx.pipeline.findFirst({
      where: { isDefault: true, archivedAt: null },
      include: { stages: { where: { archivedAt: null }, orderBy: { position: "asc" } } },
    });
    if (!pipeline) throw new NotFoundError();
    const where = { archivedAt: null, stage: { pipelineId: pipeline.id, archivedAt: null } };
    const total = await tx.deal.count({ where });
    const deals = await tx.deal.findMany({
      where,
      include: { company: true, owner: true },
      orderBy: { updatedAt: "desc" },
      take: 500,
    });
    const stages: BoardStage[] = pipeline.stages.map((stage) => ({
      id: stage.id,
      name: stage.name,
      position: stage.position,
      outcome: stage.outcome,
    }));
    return { pipelineId: pipeline.id, stages, deals: deals.map(serializeBoardDeal), truncated: total > deals.length };
  });
}
