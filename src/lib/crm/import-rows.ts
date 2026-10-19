import { neutralizeCsvCell, parseCsv } from "@/lib/csv";
import { writeAudit } from "@/lib/crm/audit";
import type { ImportRow } from "@/lib/import-shared";
import type { SessionUser } from "@/lib/auth/session";
import { withOrg, type Tx } from "@/lib/db";
import { normalizeDomain, normalizeEmail, type ImportInput } from "@/lib/validation";

const MAX_ROWS = 2000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOMAIN_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

function mappedValue(row: string[], headers: string[], mapping: Record<string, string>, field: string) {
  const header = Object.entries(mapping).find(([, mapped]) => mapped === field)?.[0];
  if (!header) return "";
  const index = headers.indexOf(header);
  if (index < 0) return "";
  return neutralizeCsvCell((row[index] ?? "").trim());
}

function planLimit(rows: string[][]) {
  if (rows.length > MAX_ROWS) {
    return `CSV has ${rows.length} rows. The limit is ${MAX_ROWS}.`;
  }
  return null;
}

export async function previewCompanies(session: SessionUser, input: ImportInput) {
  const planned = await withOrg(session.orgId, session.id, async (tx) => {
    const { headers, rows } = parseCsv(input.csv);
    const limit = planLimit(rows);
    if (limit) return { headers, rows: [] as ImportRow[], error: limit };
    const existing = await tx.company.findMany({
      where: { archivedAt: null, domain: { not: null } },
      select: { domain: true },
    });
    const domains = new Set(existing.map((company) => company.domain).filter((domain): domain is string => Boolean(domain)));
    const plannedRows = rows.map((row, index) => planCompanyRow(row, headers, input.mapping, index + 2, domains));
    return { headers, rows: plannedRows, error: null as string | null };
  });
  return planned;
}

function planCompanyRow(
  row: string[],
  headers: string[],
  mapping: Record<string, string>,
  rowNumber: number,
  domains: Set<string>,
): ImportRow {
  const values = {
    name: mappedValue(row, headers, mapping, "name"),
    domain: mappedValue(row, headers, mapping, "domain"),
    phone: mappedValue(row, headers, mapping, "phone"),
    addressLine1: mappedValue(row, headers, mapping, "addressLine1"),
    addressLine2: mappedValue(row, headers, mapping, "addressLine2"),
    city: mappedValue(row, headers, mapping, "city"),
    region: mappedValue(row, headers, mapping, "region"),
    postalCode: mappedValue(row, headers, mapping, "postalCode"),
    country: mappedValue(row, headers, mapping, "country"),
    notes: mappedValue(row, headers, mapping, "notes"),
  };
  const errors: string[] = [];
  if (!values.name) errors.push("Name is required");
  const domain = normalizeDomain(values.domain);
  if (values.domain && !domain) errors.push("Enter a domain like example.com");
  if (domain && !DOMAIN_PATTERN.test(domain)) errors.push("Enter a domain like example.com");
  if (domain && domains.has(domain)) {
    return { rowNumber, values: { ...values, domain: domain ?? "" }, status: "duplicate", errors: ["Duplicate domain in this organization"] };
  }
  if (errors.length) return { rowNumber, values, status: "invalid", errors };
  if (domain) domains.add(domain);
  return { rowNumber, values: { ...values, domain: domain ?? "" }, status: "valid", errors: [] };
}

export async function importCompanies(session: SessionUser, input: ImportInput) {
  const preview = await previewCompanies(session, input);
  if (preview.error) return { ...preview, created: 0 };
  return withOrg(session.orgId, session.id, async (tx) => {
    let created = 0;
    const rows: ImportRow[] = [];
    for (const row of preview.rows) {
      if (row.status !== "valid") {
        rows.push(row);
        continue;
      }
      const domain = row.values.domain || null;
      if (domain) {
        const existing = await tx.company.findFirst({
          where: { domain, archivedAt: null },
          select: { id: true },
        });
        if (existing) {
          rows.push({ ...row, status: "duplicate", errors: ["Duplicate domain in this organization"] });
          continue;
        }
      }
      const companyId = await insertCompany(tx, {
        orgId: session.orgId,
        name: row.values.name,
        domain,
        phone: row.values.phone || null,
        addressLine1: row.values.addressLine1 || null,
        addressLine2: row.values.addressLine2 || null,
        city: row.values.city || null,
        region: row.values.region || null,
        postalCode: row.values.postalCode || null,
        country: row.values.country || null,
        notes: row.values.notes || null,
        ownerId: session.id,
      });
      if (!companyId) {
        rows.push({ ...row, status: "duplicate", errors: ["Duplicate domain in this organization"] });
        continue;
      }
      const company = { id: companyId };
      await writeAudit(tx, {
        orgId: session.orgId,
        actorId: session.id,
        action: "CREATE",
        entityType: "company",
        entityId: company.id,
        metadata: { source: "csv", rowNumber: row.rowNumber },
      });
      created += 1;
      rows.push(row);
    }
    return { headers: preview.headers, rows, created, error: null };
  });
}

export async function previewContacts(session: SessionUser, input: ImportInput) {
  return withOrg(session.orgId, session.id, async (tx) => {
    const { headers, rows } = parseCsv(input.csv);
    const limit = planLimit(rows);
    if (limit) return { headers, rows: [] as ImportRow[], error: limit };
    const existing = await tx.contact.findMany({
      where: { archivedAt: null, email: { not: null } },
      select: { email: true },
    });
    const emails = new Set(existing.map((contact) => contact.email).filter((email): email is string => Boolean(email)));
    const companies = await tx.company.findMany({
      where: { archivedAt: null, domain: { not: null } },
      select: { id: true, domain: true },
    });
    const byDomain = new Map(companies.filter((company) => company.domain).map((company) => [company.domain as string, company.id]));
    const plannedRows = rows.map((row, index) => planContactRow(row, headers, input.mapping, index + 2, emails, byDomain));
    return { headers, rows: plannedRows, error: null as string | null };
  });
}

function planContactRow(
  row: string[],
  headers: string[],
  mapping: Record<string, string>,
  rowNumber: number,
  emails: Set<string>,
  byDomain: Map<string, string>,
): ImportRow {
  const values: Record<string, string> = {
    firstName: mappedValue(row, headers, mapping, "firstName"),
    lastName: mappedValue(row, headers, mapping, "lastName"),
    email: mappedValue(row, headers, mapping, "email"),
    phone: mappedValue(row, headers, mapping, "phone"),
    title: mappedValue(row, headers, mapping, "title"),
    companyDomain: mappedValue(row, headers, mapping, "companyDomain"),
    notes: mappedValue(row, headers, mapping, "notes"),
  };
  const errors: string[] = [];
  if (!values.firstName) errors.push("First name is required");
  if (!values.lastName) errors.push("Last name is required");
  const email = normalizeEmail(values.email);
  if (values.email && (!email || !EMAIL_PATTERN.test(email))) errors.push("Enter a valid email");
  const domain = normalizeDomain(values.companyDomain);
  if (values.companyDomain && (!domain || !DOMAIN_PATTERN.test(domain))) errors.push("Enter a domain like example.com");
  if (domain && !byDomain.has(domain)) errors.push("No company with this domain in your organization");
  const stored = { ...values, email: email ?? "", companyDomain: domain ?? "" };
  if (email && emails.has(email)) {
    return { rowNumber, values: stored, status: "duplicate", errors: ["Duplicate email in this organization"] };
  }
  if (errors.length) return { rowNumber, values: stored, status: "invalid", errors };
  if (email) emails.add(email);
  return { rowNumber, values: stored, status: "valid", errors: [] };
}

export async function importContacts(session: SessionUser, input: ImportInput) {
  const preview = await previewContacts(session, input);
  if (preview.error) return { ...preview, created: 0 };
  return withOrg(session.orgId, session.id, async (tx) => {
    const companies = await tx.company.findMany({
      where: { archivedAt: null, domain: { not: null } },
      select: { id: true, domain: true },
    });
    const byDomain = new Map(companies.filter((company) => company.domain).map((company) => [company.domain as string, company.id]));
    let created = 0;
    const rows: ImportRow[] = [];
    for (const row of preview.rows) {
      if (row.status !== "valid") {
        rows.push(row);
        continue;
      }
      const email = row.values.email || null;
      if (email) {
        const existing = await tx.contact.findFirst({ where: { email, archivedAt: null }, select: { id: true } });
        if (existing) {
          rows.push({ ...row, status: "duplicate", errors: ["Duplicate email in this organization"] });
          continue;
        }
      }
      const domain = row.values.companyDomain || null;
      const companyId = domain ? byDomain.get(domain) : undefined;
      if (domain && !companyId) {
        rows.push({ ...row, status: "invalid", errors: ["No company with this domain in your organization"] });
        continue;
      }
      const contactId = await insertContact(tx, {
        orgId: session.orgId,
        firstName: row.values.firstName,
        lastName: row.values.lastName,
        email,
        phone: row.values.phone || null,
        title: row.values.title || null,
        companyId: companyId ?? null,
        notes: row.values.notes || null,
        ownerId: session.id,
      });
      if (!contactId) {
        rows.push({ ...row, status: "duplicate", errors: ["Duplicate email in this organization"] });
        continue;
      }
      const contact = { id: contactId };
      await writeAudit(tx, {
        orgId: session.orgId,
        actorId: session.id,
        action: "CREATE",
        entityType: "contact",
        entityId: contact.id,
        metadata: { source: "csv", rowNumber: row.rowNumber },
      });
      created += 1;
      rows.push(row);
    }
    return { headers: preview.headers, rows, created, error: null };
  });
}

type CompanyInsert = {
  orgId: string;
  name: string;
  domain: string | null;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
  notes: string | null;
  ownerId: string;
};

async function insertCompany(tx: Tx, input: CompanyInsert): Promise<string | null> {
  if (!input.domain) {
    const company = await tx.company.create({ data: input, select: { id: true } });
    return company.id;
  }
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    INSERT INTO "Company" (
      id, "orgId", name, domain, phone, "addressLine1", "addressLine2",
      city, region, "postalCode", country, notes, "ownerId", "createdAt", "updatedAt"
    ) VALUES (
      gen_random_uuid(), ${input.orgId}::uuid, ${input.name}, ${input.domain}, ${input.phone},
      ${input.addressLine1}, ${input.addressLine2}, ${input.city}, ${input.region},
      ${input.postalCode}, ${input.country}, ${input.notes}, ${input.ownerId}::uuid, now(), now()
    )
    ON CONFLICT ("orgId", "domain") WHERE "domain" IS NOT NULL AND "archivedAt" IS NULL
    DO NOTHING
    RETURNING id
  `;
  return rows[0]?.id ?? null;
}

type ContactInsert = {
  orgId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  companyId: string | null;
  notes: string | null;
  ownerId: string;
};

async function insertContact(tx: Tx, input: ContactInsert): Promise<string | null> {
  if (!input.email) {
    const contact = await tx.contact.create({ data: input, select: { id: true } });
    return contact.id;
  }
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    INSERT INTO "Contact" (
      id, "orgId", "firstName", "lastName", email, phone, title, "companyId",
      notes, "ownerId", "createdAt", "updatedAt"
    ) VALUES (
      gen_random_uuid(), ${input.orgId}::uuid, ${input.firstName}, ${input.lastName}, ${input.email},
      ${input.phone}, ${input.title}, ${input.companyId}::uuid, ${input.notes}, ${input.ownerId}::uuid,
      now(), now()
    )
    ON CONFLICT ("orgId", "email") WHERE "email" IS NOT NULL AND "archivedAt" IS NULL
    DO NOTHING
    RETURNING id
  `;
  return rows[0]?.id ?? null;
}
