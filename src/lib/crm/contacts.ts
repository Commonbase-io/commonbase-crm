import { writeAudit } from "@/lib/crm/audit";
import type { SessionUser } from "@/lib/auth/session";
import { isPrismaNotFound, withOrg, type Tx } from "@/lib/db";
import { HttpError, NotFoundError } from "@/lib/errors";
import type { ContactInput, ListQuery } from "@/lib/validation";

const contactSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  title: true,
  companyId: true,
  notes: true,
  ownerId: true,
  owner: { select: { id: true, name: true } },
  company: { select: { id: true, name: true } },
} as const;

async function resolveOwner(tx: Tx, session: SessionUser, ownerId?: string) {
  const id = ownerId || session.id;
  const owner = await tx.user.findFirst({ where: { id, deactivatedAt: null }, select: { id: true } });
  if (!owner) throw new HttpError(400, "Choose an owner", { ownerId: "Choose an active user in this organization" });
  return owner.id;
}

async function assertCompany(tx: Tx, companyId: string | null) {
  if (!companyId) return;
  const company = await tx.company.findFirst({ where: { id: companyId, archivedAt: null }, select: { id: true } });
  if (!company) throw new NotFoundError();
}

async function assertEmailAvailable(tx: Tx, email: string | null, exceptId?: string) {
  if (!email) return;
  const existing = await tx.contact.findFirst({
    where: { email, archivedAt: null, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
    select: { id: true },
  });
  if (existing) {
    throw new HttpError(400, "A contact with this email already exists", {
      email: "A contact with this email already exists",
    });
  }
}

export async function listContacts(session: SessionUser, query: ListQuery) {
  return withOrg(session.orgId, session.id, async (tx) => {
    const where = {
      archivedAt: null,
      ...(query.ownerId ? { ownerId: query.ownerId } : {}),
      ...(query.companyId ? { companyId: query.companyId } : {}),
      ...(query.q
        ? {
            OR: [
              { firstName: { contains: query.q, mode: "insensitive" as const } },
              { lastName: { contains: query.q, mode: "insensitive" as const } },
              { email: { contains: query.q, mode: "insensitive" as const } },
              { phone: { contains: query.q, mode: "insensitive" as const } },
              { title: { contains: query.q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      tx.contact.findMany({
        where,
        select: contactSelect,
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      tx.contact.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  });
}

export async function getContact(session: SessionUser, id: string) {
  return withOrg(session.orgId, session.id, async (tx) => {
    const contact = await tx.contact.findFirst({
      where: { id, archivedAt: null },
      select: {
        ...contactSelect,
        dealContacts: {
          where: { deal: { archivedAt: null } },
          select: { deal: { select: { id: true, name: true, status: true, amountCents: true, currency: true } } },
        },
        noteRows: {
          where: { archivedAt: null },
          select: { id: true, body: true, createdAt: true, author: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (!contact) throw new NotFoundError();
    return {
      ...contact,
      deals: contact.dealContacts.map((link) => link.deal),
      activity: contact.noteRows.map((note) => ({
        id: note.id,
        body: note.body,
        createdAt: note.createdAt.toISOString(),
        authorName: note.author.name,
      })),
    };
  });
}

export async function createContact(session: SessionUser, input: ContactInput) {
  return withOrg(session.orgId, session.id, async (tx) => {
    const ownerId = await resolveOwner(tx, session, input.ownerId);
    await assertCompany(tx, input.companyId);
    await assertEmailAvailable(tx, input.email);
    const contact = await tx.contact.create({
      data: {
        orgId: session.orgId,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        phone: input.phone,
        title: input.title,
        companyId: input.companyId,
        notes: input.notes,
        ownerId,
      },
      select: contactSelect,
    });
    await writeAudit(tx, {
      orgId: session.orgId,
      actorId: session.id,
      action: "CREATE",
      entityType: "contact",
      entityId: contact.id,
      metadata: { email: contact.email },
    });
    return contact;
  });
}

export async function updateContact(session: SessionUser, id: string, input: ContactInput) {
  return withOrg(session.orgId, session.id, async (tx) => {
    const current = await tx.contact.findFirst({ where: { id, archivedAt: null }, select: { id: true } });
    if (!current) throw new NotFoundError();
    const ownerId = await resolveOwner(tx, session, input.ownerId);
    await assertCompany(tx, input.companyId);
    await assertEmailAvailable(tx, input.email, id);
    try {
      const contact = await tx.contact.update({
        where: { id },
        data: {
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email,
          phone: input.phone,
          title: input.title,
          companyId: input.companyId,
          notes: input.notes,
          ownerId,
        },
        select: contactSelect,
      });
      await writeAudit(tx, {
        orgId: session.orgId,
        actorId: session.id,
        action: "UPDATE",
        entityType: "contact",
        entityId: id,
      });
      return contact;
    } catch (error) {
      if (isPrismaNotFound(error)) throw new NotFoundError();
      throw error;
    }
  });
}

export async function archiveContact(session: SessionUser, id: string) {
  return withOrg(session.orgId, session.id, async (tx) => {
    const current = await tx.contact.findFirst({ where: { id, archivedAt: null }, select: { id: true } });
    if (!current) throw new NotFoundError();
    await tx.contact.update({ where: { id }, data: { archivedAt: new Date() } });
    await writeAudit(tx, {
      orgId: session.orgId,
      actorId: session.id,
      action: "DELETE",
      entityType: "contact",
      entityId: id,
    });
    return { ok: true };
  });
}
