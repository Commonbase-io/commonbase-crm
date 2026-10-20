import { writeAudit } from "@/lib/crm/audit";
import { writeBarrier } from "@/lib/crm/write-barrier";
import type { SessionUser } from "@/lib/auth/session";
import { isPrismaNotFound, isUniqueViolation, withOrg, type Tx } from "@/lib/db";
import { HttpError, NotFoundError } from "@/lib/errors";
import type { CompanyInput, ListQuery } from "@/lib/validation";

const companySelect = {
  id: true,
  name: true,
  domain: true,
  phone: true,
  addressLine1: true,
  addressLine2: true,
  city: true,
  region: true,
  postalCode: true,
  country: true,
  notes: true,
  ownerId: true,
  owner: { select: { id: true, name: true } },
} as const;

async function resolveOwner(tx: Tx, session: SessionUser, ownerId?: string) {
  const id = ownerId || session.id;
  const owner = await tx.user.findFirst({ where: { id, deactivatedAt: null }, select: { id: true, name: true } });
  if (!owner) {
    throw new HttpError(400, "Choose an owner", { ownerId: "Choose an active user in this organization" });
  }
  return owner;
}

async function assertDomainAvailable(tx: Tx, domain: string | null, exceptId?: string) {
  if (!domain) return;
  const existing = await tx.company.findFirst({
    where: { domain, archivedAt: null, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
    select: { id: true },
  });
  if (existing) {
    throw new HttpError(400, "A company with this domain already exists", {
      domain: "A company with this domain already exists",
    });
  }
}

function listWhere(query: ListQuery) {
  return {
    archivedAt: null,
    ...(query.ownerId ? { ownerId: query.ownerId } : {}),
    ...(query.q
      ? {
          OR: [
            { name: { contains: query.q, mode: "insensitive" as const } },
            { domain: { contains: query.q, mode: "insensitive" as const } },
            { phone: { contains: query.q, mode: "insensitive" as const } },
            { city: { contains: query.q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
}

export async function listCompanies(session: SessionUser, query: ListQuery) {
  return withOrg(session.orgId, session.id, async (tx) => {
    const where = listWhere(query);
    const [items, total] = await Promise.all([
      tx.company.findMany({
        where,
        select: companySelect,
        orderBy: { name: "asc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      tx.company.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  });
}

export async function getCompany(session: SessionUser, id: string) {
  return withOrg(session.orgId, session.id, async (tx) => {
    const company = await tx.company.findFirst({
      where: { id, archivedAt: null },
      select: {
        ...companySelect,
        contacts: {
          where: { archivedAt: null },
          select: { id: true, firstName: true, lastName: true, email: true, title: true },
          orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        },
        deals: {
          where: { archivedAt: null },
          select: { id: true, name: true, amountCents: true, currency: true, status: true, stage: { select: { name: true } } },
          orderBy: { updatedAt: "desc" },
        },
        noteRows: {
          where: { archivedAt: null },
          select: { id: true, body: true, createdAt: true, author: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (!company) throw new NotFoundError();
    return {
      ...company,
      activity: company.noteRows.map((note) => ({
        id: note.id,
        body: note.body,
        createdAt: note.createdAt.toISOString(),
        authorName: note.author.name,
      })),
    };
  });
}

export async function createCompany(session: SessionUser, input: CompanyInput) {
  try {
    return await withOrg(session.orgId, session.id, (tx) => createCompanyTx(tx, session, input));
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new HttpError(400, "A company with this domain already exists", {
        domain: "A company with this domain already exists",
      });
    }
    throw error;
  }
}

export async function createCompanyTx(tx: Tx, session: SessionUser, input: CompanyInput) {
  const owner = await resolveOwner(tx, session, input.ownerId);
  await assertDomainAvailable(tx, input.domain);
  const company = await tx.company.create({
    data: {
      orgId: session.orgId,
      name: input.name,
      domain: input.domain,
      phone: input.phone,
      addressLine1: input.addressLine1,
      addressLine2: input.addressLine2,
      city: input.city,
      region: input.region,
      postalCode: input.postalCode,
      country: input.country,
      notes: input.notes,
      ownerId: owner.id,
    },
    select: companySelect,
  });
  await writeAudit(tx, {
    orgId: session.orgId,
    actorId: session.id,
    action: "CREATE",
    entityType: "company",
    entityId: company.id,
    metadata: { name: company.name },
  });
  return company;
}

export async function updateCompany(session: SessionUser, id: string, input: CompanyInput) {
  try {
    return await updateCompanyInOrg(session, id, input);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new HttpError(400, "A company with this domain already exists", {
        domain: "A company with this domain already exists",
      });
    }
    throw error;
  }
}

async function updateCompanyInOrg(session: SessionUser, id: string, input: CompanyInput) {
  return withOrg(session.orgId, session.id, async (tx) => {
    const current = await tx.company.findFirst({ where: { id, archivedAt: null } });
    if (!current) throw new NotFoundError();
    const owner = await resolveOwner(tx, session, input.ownerId);
    await assertDomainAvailable(tx, input.domain, id);
    try {
      const company = await tx.company.update({
        where: { id },
        data: {
          name: input.name,
          domain: input.domain,
          phone: input.phone,
          addressLine1: input.addressLine1,
          addressLine2: input.addressLine2,
          city: input.city,
          region: input.region,
          postalCode: input.postalCode,
          country: input.country,
          notes: input.notes,
          ownerId: owner.id,
        },
        select: companySelect,
      });
      await writeAudit(tx, {
        orgId: session.orgId,
        actorId: session.id,
        action: "UPDATE",
        entityType: "company",
        entityId: id,
        metadata: { name: company.name },
      });
      return company;
    } catch (error) {
      if (isPrismaNotFound(error)) throw new NotFoundError();
      throw error;
    }
  });
}

export async function archiveCompany(session: SessionUser, id: string) {
  return withOrg(session.orgId, session.id, async (tx) => {
    const current = await tx.company.findFirst({ where: { id, archivedAt: null }, select: { id: true } });
    if (!current) throw new NotFoundError();
    const [contacts, deals] = await Promise.all([
      tx.contact.count({ where: { companyId: id, archivedAt: null } }),
      tx.deal.count({ where: { companyId: id, archivedAt: null } }),
    ]);
    if (contacts > 0 || deals > 0) {
      throw new HttpError(400, "Archive this company's contacts and deals first", {
        companyId: "Archive this company's contacts and deals first.",
      });
    }
    await writeBarrier("company-archive");
    try {
      await tx.company.update({ where: { id }, data: { archivedAt: new Date() } });
    } catch (error) {
      if (isPrismaNotFound(error)) throw new NotFoundError();
      throw error;
    }
    await writeAudit(tx, {
      orgId: session.orgId,
      actorId: session.id,
      action: "DELETE",
      entityType: "company",
      entityId: id,
    });
    return { ok: true };
  });
}
