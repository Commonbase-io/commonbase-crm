import { writeAudit } from "@/lib/crm/audit";
import { createCompanyTx } from "@/lib/crm/companies";
import { lockCompany, lockContact } from "@/lib/crm/locks";
import { writeBarrier } from "@/lib/crm/write-barrier";
import type { SessionUser } from "@/lib/auth/session";
import { errorText, isPrismaNotFound, isUniqueViolation, withOrg, type Tx } from "@/lib/db";
import { HttpError, NotFoundError } from "@/lib/errors";
import type { ContactCreateInput, ContactInput, ListQuery } from "@/lib/validation";

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

async function requireCompany(tx: Tx, companyId: string) {
  const company = await tx.company.findFirst({ where: { id: companyId, archivedAt: null }, select: { id: true } });
  if (!company) throw new NotFoundError();
  return company.id;
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

function duplicateEmail(): HttpError {
  return new HttpError(400, "A contact with this email already exists", {
    email: "A contact with this email already exists",
  });
}

export async function createContact(session: SessionUser, input: ContactCreateInput) {
  try {
    return await withOrg(session.orgId, session.id, async (tx) => {
      if (input.company) {
        const company = await createCompanyTx(tx, session, input.company);
        return createContactTx(tx, session, {
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email,
          phone: input.phone,
          title: input.title,
          notes: input.notes,
          ownerId: input.ownerId,
          companyId: company.id,
        });
      }
      if (!input.companyId) {
        throw new HttpError(400, "Choose a company", { companyId: "Choose a company" });
      }
      return createContactTx(tx, session, {
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        phone: input.phone,
        title: input.title,
        notes: input.notes,
        ownerId: input.ownerId,
        companyId: input.companyId,
      });
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      if (errorText(error).toLowerCase().includes("domain")) {
        throw new HttpError(400, "A company with this domain already exists", {
          domain: "A company with this domain already exists",
        });
      }
      throw duplicateEmail();
    }
    throw error;
  }
}

export async function createContactTx(tx: Tx, session: SessionUser, input: ContactInput) {
  const ownerId = await resolveOwner(tx, session, input.ownerId);
  const companyId = await requireCompany(tx, input.companyId);
  await writeBarrier("contact-create");
  await assertEmailAvailable(tx, input.email);
  const contact = await tx.contact.create({
    data: {
      orgId: session.orgId,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone,
      title: input.title,
      companyId,
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
}

export async function updateContact(session: SessionUser, id: string, input: ContactInput) {
  try {
    return await updateContactInOrg(session, id, input);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new HttpError(400, "A contact with this email already exists", {
        email: "A contact with this email already exists",
      });
    }
    throw error;
  }
}

async function updateContactInOrg(session: SessionUser, id: string, input: ContactInput) {
  return withOrg(session.orgId, session.id, async (tx) => {
    // Hold these rows across the link check and the company change. Company
    // first, then contact, so this cannot deadlock with a deal write that
    // locks contacts in id order.
    await lockCompany(tx, input.companyId);
    await lockContact(tx, id);
    const current = await tx.contact.findFirst({
      where: { id, archivedAt: null },
      select: { id: true, companyId: true },
    });
    if (!current) throw new NotFoundError();
    if (input.companyId !== current.companyId) {
      const links = await tx.dealContact.count({ where: { contactId: id } });
      if (links > 0) {
        throw new HttpError(400, "Remove this contact from their deals before moving them to another company", {
          companyId: "Remove this contact from their deals before moving them to another company",
        });
      }
    }
    await writeBarrier("contact-reassign");
    const ownerId = await resolveOwner(tx, session, input.ownerId);
    const companyId = await requireCompany(tx, input.companyId);
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
          companyId,
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
    const deals = await tx.deal.findMany({
      where: { archivedAt: null, dealContacts: { some: { contactId: id } } },
      select: { name: true, _count: { select: { dealContacts: true } } },
    });
    const sole = deals.filter((deal) => deal._count.dealContacts < 2);
    if (sole.length > 0) {
      const names = sole.map((deal) => deal.name).join(", ");
      throw new HttpError(400, "This contact is the only person on a deal", {
        contactId: `This contact is the only person on ${names}. Add another contact from the same company or archive the deal first.`,
      });
    }
    await writeBarrier("contact-archive");
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
