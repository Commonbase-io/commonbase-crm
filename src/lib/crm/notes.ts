import { writeAudit } from "@/lib/crm/audit";
import type { SessionUser } from "@/lib/auth/session";
import { withOrg, type Tx } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import type { NoteInput } from "@/lib/validation";

async function assertParent(tx: Tx, input: NoteInput) {
  if (input.companyId) {
    const row = await tx.company.findFirst({ where: { id: input.companyId, archivedAt: null }, select: { id: true } });
    if (!row) throw new NotFoundError();
  }
  if (input.contactId) {
    const row = await tx.contact.findFirst({ where: { id: input.contactId, archivedAt: null }, select: { id: true } });
    if (!row) throw new NotFoundError();
  }
  if (input.dealId) {
    const row = await tx.deal.findFirst({ where: { id: input.dealId, archivedAt: null }, select: { id: true } });
    if (!row) throw new NotFoundError();
  }
}

export async function listNotes(session: SessionUser, filter: { companyId?: string; contactId?: string; dealId?: string }) {
  return withOrg(session.orgId, session.id, async (tx) => {
    if (filter.companyId || filter.contactId || filter.dealId) {
      await assertParent(tx, {
        body: "check",
        companyId: filter.companyId ?? null,
        contactId: filter.contactId ?? null,
        dealId: filter.dealId ?? null,
      });
    }
    const notes = await tx.note.findMany({
      where: {
        archivedAt: null,
        ...(filter.companyId ? { companyId: filter.companyId } : {}),
        ...(filter.contactId ? { contactId: filter.contactId } : {}),
        ...(filter.dealId ? { dealId: filter.dealId } : {}),
      },
      select: { id: true, body: true, createdAt: true, companyId: true, contactId: true, dealId: true, author: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return notes.map((note) => ({
      id: note.id,
      body: note.body,
      createdAt: note.createdAt.toISOString(),
      authorName: note.author.name,
      companyId: note.companyId,
      contactId: note.contactId,
      dealId: note.dealId,
    }));
  });
}

export async function createNote(session: SessionUser, input: NoteInput) {
  return withOrg(session.orgId, session.id, async (tx) => {
    await assertParent(tx, input);
    const note = await tx.note.create({
      data: {
        orgId: session.orgId,
        body: input.body,
        authorId: session.id,
        companyId: input.companyId,
        contactId: input.contactId,
        dealId: input.dealId,
      },
      select: { id: true, body: true, createdAt: true, author: { select: { name: true } } },
    });
    await writeAudit(tx, {
      orgId: session.orgId,
      actorId: session.id,
      action: "CREATE",
      entityType: "note",
      entityId: note.id,
    });
    return {
      id: note.id,
      body: note.body,
      createdAt: note.createdAt.toISOString(),
      authorName: note.author.name,
    };
  });
}

export async function archiveNote(session: SessionUser, id: string) {
  return withOrg(session.orgId, session.id, async (tx) => {
    const current = await tx.note.findFirst({ where: { id, archivedAt: null }, select: { id: true } });
    if (!current) throw new NotFoundError();
    await tx.note.update({ where: { id }, data: { archivedAt: new Date() } });
    await writeAudit(tx, {
      orgId: session.orgId,
      actorId: session.id,
      action: "DELETE",
      entityType: "note",
      entityId: id,
    });
    return { ok: true };
  });
}
