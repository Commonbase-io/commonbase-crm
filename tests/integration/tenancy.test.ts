import { beforeEach, describe, expect, it } from "vitest";
import { POST as login } from "@/app/api/auth/login/route";
import { GET as listCompanies, POST as createCompany } from "@/app/api/companies/route";
import { GET as getCompany, PATCH as patchCompany } from "@/app/api/companies/[id]/route";
import { GET as listContacts } from "@/app/api/contacts/route";
import { GET as getContact, PATCH as patchContact } from "@/app/api/contacts/[id]/route";
import { GET as listDeals } from "@/app/api/deals/route";
import { GET as getDeal, PATCH as patchDeal } from "@/app/api/deals/[id]/route";
import { GET as listNotes } from "@/app/api/notes/route";
import { POST as previewCompanies } from "@/app/api/import/companies/preview/route";
import { POST as importCompanies } from "@/app/api/import/companies/route";
import { prisma, withOrg } from "@/lib/db";
import { admin, call, makeOrg, resetDb, sessionCookie } from "../helpers/db";

async function signIn(email: string) {
  const response = await call(login, "/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password: "Password1" }),
  });
  return sessionCookie(response.cookie);
}

beforeEach(async () => {
  await resetDb();
});

describe("tenant isolation", () => {
  it("does not let org A read, update, search, or import org B", async () => {
    const secret = "b-secret-token";
    const a = await makeOrg({ name: "Org A", slug: "org-a", email: "a@example.com", userName: "A Admin" });
    const b = await makeOrg({ name: "Org B", slug: "org-b", email: "b@example.com", userName: "B Admin" });
    const bStage = await admin.stage.findFirstOrThrow({ where: { orgId: b.org.id, name: "Lead" } });
    const bCompany = await admin.company.create({
      data: { orgId: b.org.id, name: secret, domain: "secret.example", ownerId: b.user.id, notes: "private note" },
    });
    const bContact = await admin.contact.create({
      data: {
        orgId: b.org.id,
        firstName: "Secret",
        lastName: "Person",
        email: "secret@example.com",
        companyId: bCompany.id,
        ownerId: b.user.id,
      },
    });
    const bDeal = await admin.$transaction(async (tx) => {
      const created = await tx.deal.create({
        data: { orgId: b.org.id, name: secret, amountCents: 100, stageId: bStage.id, companyId: bCompany.id, ownerId: b.user.id },
      });
      await tx.dealContact.create({
        data: { orgId: b.org.id, dealId: created.id, contactId: bContact.id, companyId: bCompany.id },
      });
      return created;
    });
    const bNote = await admin.note.create({
      data: { orgId: b.org.id, body: secret, authorId: b.user.id, dealId: bDeal.id },
    });

    const cookie = await signIn("a@example.com");

    const companies = await call(listCompanies, `/api/companies?q=${secret}`, { cookie });
    expect(companies.status).toBe(200);
    expect(companies.body.items).toEqual([]);
    const oneCompany = await call(getCompany, `/api/companies/${bCompany.id}`, { cookie, params: { id: bCompany.id } });
    expect(oneCompany.status).toBe(404);
    const patched = await call(patchCompany, `/api/companies/${bCompany.id}`, {
      method: "PATCH",
      cookie,
      params: { id: bCompany.id },
      body: JSON.stringify({ name: "Hacked" }),
    });
    expect(patched.status).toBe(404);

    const contacts = await call(listContacts, `/api/contacts?q=${secret}`, { cookie });
    expect(contacts.body.items).toEqual([]);
    expect((await call(getContact, `/api/contacts/${bContact.id}`, { cookie, params: { id: bContact.id } })).status).toBe(404);
    expect(
      (
        await call(patchContact, `/api/contacts/${bContact.id}`, {
          method: "PATCH",
          cookie,
          params: { id: bContact.id },
          body: JSON.stringify({
            firstName: "Hacked",
            lastName: "Person",
            companyId: "11111111-1111-4111-8111-111111111111",
          }),
        })
      ).status,
    ).toBe(404);

    const deals = await call(listDeals, `/api/deals?q=${secret}`, { cookie });
    expect(deals.body.items).toEqual([]);
    expect((await call(getDeal, `/api/deals/${bDeal.id}`, { cookie, params: { id: bDeal.id } })).status).toBe(404);
    expect(
      (
        await call(patchDeal, `/api/deals/${bDeal.id}`, {
          method: "PATCH",
          cookie,
          params: { id: bDeal.id },
          body: JSON.stringify({
            name: "Hacked",
            amount: "10",
            companyId: "11111111-1111-4111-8111-111111111111",
            contactIds: ["22222222-2222-4222-8222-222222222222"],
          }),
        })
      ).status,
    ).toBe(404);

    const notes = await call(listNotes, `/api/notes?dealId=${bDeal.id}`, { cookie });
    expect(notes.status).toBe(404);
    expect(JSON.stringify(notes.body)).not.toContain(secret);

    const csv = `name,domain,notes\nImported Co,secret.example,local only`;
    const preview = await call(previewCompanies, "/api/import/companies/preview", {
      method: "POST",
      cookie,
      body: JSON.stringify({ csv, mapping: { name: "name", domain: "domain", notes: "notes" } }),
    });
    expect(preview.status).toBe(200);
    expect(JSON.stringify(preview.body)).not.toContain(secret);
    expect(preview.body.rows[0].status).toBe("valid");
    const imported = await call(importCompanies, "/api/import/companies", {
      method: "POST",
      cookie,
      body: JSON.stringify({ csv, mapping: { name: "name", domain: "domain", notes: "notes" } }),
    });
    expect(imported.body.created).toBe(1);
    expect(JSON.stringify(imported.body)).not.toContain(secret);

    const still = await admin.company.findUniqueOrThrow({ where: { id: bCompany.id } });
    expect(still.name).toBe(secret);
    const importedRow = await admin.company.findFirstOrThrow({ where: { orgId: a.org.id, domain: "secret.example" } });
    expect(importedRow.name).toBe("Imported Co");

    const visible = await withOrg(a.org.id, a.user.id, (tx) => tx.company.findMany());
    expect(visible.map((company) => company.id)).toEqual([importedRow.id]);
    const hiddenUpdate = await withOrg(a.org.id, a.user.id, (tx) =>
      tx.company.updateMany({ where: { id: bCompany.id }, data: { name: "Hacked" } }),
    );
    expect(hiddenUpdate.count).toBe(0);

    const unscoped = await prisma.company.findMany();
    expect(unscoped).toEqual([]);

    await admin.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL ROLE crm_owner");
      const forced = await tx.$queryRaw<Array<{ count: number }>>`SELECT count(*)::int AS count FROM "Company"`;
      expect(Number(forced[0]?.count)).toBe(0);
    });

    expect(bNote.body).toBe(secret);
  });

  it("fails closed when a request creates a company without an org context", async () => {
    const a = await makeOrg({ name: "Org A", slug: "org-a", email: "a@example.com" });
    const cookie = await signIn("a@example.com");
    const created = await call(createCompany, "/api/companies", {
      method: "POST",
      cookie,
      body: JSON.stringify({ name: "Visible Co", domain: "visible.example" }),
    });
    expect(created.status).toBe(201);
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM "Company"`;
    expect(rows).toEqual([]);
    const owned = await withOrg(a.org.id, a.user.id, (tx) => tx.company.findMany());
    expect(owned).toHaveLength(1);
  });
});
