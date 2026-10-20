import { beforeEach, describe, expect, it } from "vitest";
import { POST as login } from "@/app/api/auth/login/route";
import { DELETE as archiveCompany } from "@/app/api/companies/[id]/route";
import { POST as createContact } from "@/app/api/contacts/route";
import { DELETE as archiveContact, PATCH as patchContact } from "@/app/api/contacts/[id]/route";
import { POST as createDeal } from "@/app/api/deals/route";
import { PATCH as patchDeal } from "@/app/api/deals/[id]/route";
import { POST as importContacts } from "@/app/api/import/contacts/route";
import { prisma, withOrg } from "@/lib/db";
import { admin, call, makeOrg, resetDb, sessionCookie } from "../helpers/db";

beforeEach(async () => {
  await resetDb();
});

async function signIn(email: string) {
  const response = await call(login, "/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password: "Password1" }),
  });
  return sessionCookie(response.cookie);
}

async function fixture() {
  const a = await makeOrg({ name: "Org A", slug: "org-a", email: "a@example.com", userName: "Ada" });
  const b = await makeOrg({ name: "Org B", slug: "org-b", email: "b@example.com", userName: "Bea" });
  const stage = await admin.stage.findFirstOrThrow({ where: { orgId: a.org.id, name: "Lead" } });
  const company = await admin.company.create({
    data: { orgId: a.org.id, name: "Alpha Co", domain: "alpha.example", ownerId: a.user.id },
  });
  const other = await admin.company.create({
    data: { orgId: a.org.id, name: "Beta Co", domain: "beta.example", ownerId: a.user.id },
  });
  const contact = await admin.contact.create({
    data: { orgId: a.org.id, firstName: "Pat", lastName: "Alpha", email: "pat@alpha.example", companyId: company.id, ownerId: a.user.id },
  });
  const otherContact = await admin.contact.create({
    data: { orgId: a.org.id, firstName: "Sam", lastName: "Beta", email: "sam@beta.example", companyId: other.id, ownerId: a.user.id },
  });
  const bCompany = await admin.company.create({
    data: { orgId: b.org.id, name: "Other Org Co", domain: "other.example", ownerId: b.user.id },
  });
  const bContact = await admin.contact.create({
    data: { orgId: b.org.id, firstName: "Ora", lastName: "Other", email: "ora@other.example", companyId: bCompany.id, ownerId: b.user.id },
  });
  const cookie = await signIn("a@example.com");
  return { a, b, stage, company, other, contact, otherContact, bCompany, bContact, cookie };
}

function dealBody(input: { stageId: string; companyId?: string | null; contactIds?: string[]; name?: string }) {
  return {
    name: input.name ?? "Retainer",
    amount: "10.00",
    currency: "USD",
    stageId: input.stageId,
    companyId: input.companyId,
    contactIds: input.contactIds ?? [],
  };
}

describe("record hierarchy", () => {
  it("rejects a deal without a company", async () => {
    const { stage, contact, cookie, a } = await fixture();
    const response = await call(createDeal, "/api/deals", {
      method: "POST",
      cookie,
      body: JSON.stringify(dealBody({ stageId: stage.id, companyId: "", contactIds: [contact.id] })),
    });
    expect(response.status).toBe(400);
    expect(response.body.error).not.toBe("Validation failed");
    expect(response.body.fieldErrors.companyId).toMatch(/company/i);
    expect(await admin.deal.count({ where: { orgId: a.org.id } })).toBe(0);
  });

  it("rejects a deal without a contact", async () => {
    const { stage, company, cookie, a } = await fixture();
    const response = await call(createDeal, "/api/deals", {
      method: "POST",
      cookie,
      body: JSON.stringify(dealBody({ stageId: stage.id, companyId: company.id, contactIds: [] })),
    });
    expect(response.status).toBe(400);
    expect(response.body.error).not.toBe("Validation failed");
    expect(response.body.fieldErrors.contactIds).toMatch(/contact/i);
    expect(await admin.deal.count({ where: { orgId: a.org.id } })).toBe(0);
  });

  it("rejects a deal whose contact belongs to a different company", async () => {
    const { stage, company, otherContact, cookie, a } = await fixture();
    const response = await call(createDeal, "/api/deals", {
      method: "POST",
      cookie,
      body: JSON.stringify(dealBody({ stageId: stage.id, companyId: company.id, contactIds: [otherContact.id] })),
    });
    expect(response.status).toBe(400);
    expect(response.body.error).not.toBe("Validation failed");
    expect(response.body.fieldErrors.contactIds).toMatch(/company/i);
    expect(await admin.deal.count({ where: { orgId: a.org.id } })).toBe(0);
  });

  it("rejects a contact without a company", async () => {
    const { cookie, a } = await fixture();
    const response = await call(createContact, "/api/contacts", {
      method: "POST",
      cookie,
      body: JSON.stringify({ firstName: "Lonely", lastName: "Person", companyId: "" }),
    });
    expect(response.status).toBe(400);
    expect(response.body.error).not.toBe("Validation failed");
    expect(response.body.fieldErrors.companyId).toMatch(/company/i);
    expect(await admin.contact.count({ where: { orgId: a.org.id, firstName: "Lonely" } })).toBe(0);
  });

  it("rejects the same hierarchy mistakes when the ids belong to another organization", async () => {
    const { stage, company, contact, bCompany, bContact, cookie, a } = await fixture();
    const foreignCompany = await call(createDeal, "/api/deals", {
      method: "POST",
      cookie,
      body: JSON.stringify(dealBody({ stageId: stage.id, companyId: bCompany.id, contactIds: [contact.id], name: "Foreign company" })),
    });
    expect(foreignCompany.status).toBe(404);
    const foreignContact = await call(createDeal, "/api/deals", {
      method: "POST",
      cookie,
      body: JSON.stringify(dealBody({ stageId: stage.id, companyId: company.id, contactIds: [bContact.id], name: "Foreign contact" })),
    });
    expect(foreignContact.status).toBe(404);
    const foreignContactCreate = await call(createContact, "/api/contacts", {
      method: "POST",
      cookie,
      body: JSON.stringify({ firstName: "Sneak", lastName: "In", companyId: bCompany.id }),
    });
    expect(foreignContactCreate.status).toBe(404);
    expect(await admin.deal.count({ where: { orgId: a.org.id } })).toBe(0);
    expect(await admin.contact.count({ where: { orgId: a.org.id, firstName: "Sneak" } })).toBe(0);
  });

  it("rejects imports, updates, and archives that would break the hierarchy", async () => {
    const { a, stage, company, other, contact, otherContact, cookie } = await fixture();
    const deal = await admin.$transaction(async (tx) => {
      const created = await tx.deal.create({
        data: {
          orgId: a.org.id,
          name: "Kept",
          amountCents: 100,
          stageId: stage.id,
          companyId: company.id,
          ownerId: a.user.id,
        },
      });
      await tx.dealContact.create({
        data: { orgId: a.org.id, dealId: created.id, contactId: contact.id, companyId: company.id },
      });
      return created;
    });

    const moved = await call(patchContact, `/api/contacts/${contact.id}`, {
      method: "PATCH",
      cookie,
      params: { id: contact.id },
      body: JSON.stringify({ firstName: "Pat", lastName: "Alpha", companyId: other.id }),
    });
    expect(moved.status).toBe(400);
    expect(moved.body.fieldErrors.companyId).toMatch(/deal/i);

    const archivedContact = await call(archiveContact, `/api/contacts/${contact.id}`, {
      method: "DELETE",
      cookie,
      params: { id: contact.id },
    });
    expect(archivedContact.status).toBe(400);
    expect(archivedContact.body.fieldErrors.contactId).toMatch(/deal/i);

    const cleared = await call(patchDeal, `/api/deals/${deal.id}`, {
      method: "PATCH",
      cookie,
      params: { id: deal.id },
      body: JSON.stringify({ name: "Kept", amount: "1.00", companyId: company.id, contactIds: [] }),
    });
    expect(cleared.status).toBe(400);
    expect(cleared.body.fieldErrors.contactIds).toMatch(/contact/i);

    const swapped = await call(patchDeal, `/api/deals/${deal.id}`, {
      method: "PATCH",
      cookie,
      params: { id: deal.id },
      body: JSON.stringify({ name: "Kept", amount: "1.00", companyId: other.id, contactIds: [contact.id] }),
    });
    expect(swapped.status).toBe(400);
    expect(swapped.body.fieldErrors.contactIds).toMatch(/company/i);

    const archivedCompany = await call(archiveCompany, `/api/companies/${company.id}`, {
      method: "DELETE",
      cookie,
      params: { id: company.id },
    });
    expect(archivedCompany.status).toBe(400);
    expect(archivedCompany.body.fieldErrors.companyId).toMatch(/archive/i);

    const csv = ["firstName,lastName,email", "No,Company,nocompany@alpha.example"].join("\n");
    const imported = await call(importContacts, "/api/import/contacts", {
      method: "POST",
      cookie,
      body: JSON.stringify({
        csv,
        mapping: { firstName: "firstName", lastName: "lastName", email: "email" },
      }),
    });
    expect(imported.status).toBe(200);
    expect(imported.body.created).toBe(0);
    expect(imported.body.rows[0].status).toBe("invalid");
    expect(imported.body.rows[0].errors.join(" ")).toMatch(/company/i);
    expect(await admin.contact.count({ where: { email: "nocompany@alpha.example" } })).toBe(0);
    expect(await admin.company.findUniqueOrThrow({ where: { id: company.id } })).toMatchObject({ archivedAt: null });
    expect(otherContact.companyId).toBe(other.id);
  });

  it("rejects raw writes that skip the API, including across organizations", async () => {
    const { a, b, stage, company, other, contact, bCompany } = await fixture();
    await expect(
      withOrg(a.org.id, a.user.id, (tx) =>
        tx.$executeRaw`
          INSERT INTO "Deal" (id, "orgId", name, "amountCents", currency, "stageId", "companyId", "ownerId", status, "createdAt", "updatedAt")
          VALUES (gen_random_uuid(), ${a.org.id}::uuid, 'Orphan', 100, 'USD', ${stage.id}::uuid, NULL, ${a.user.id}::uuid, 'OPEN', now(), now())
        `,
      ),
    ).rejects.toThrow(/companyId|null/i);

    await expect(
      admin.$transaction(async (tx) => {
        await tx.deal.create({
          data: {
            orgId: a.org.id,
            name: "Needs a person",
            amountCents: 100,
            stageId: stage.id,
            companyId: company.id,
            ownerId: a.user.id,
          },
        });
      }),
    ).rejects.toThrow(/deal_requires_contact/);
    expect(await admin.deal.count({ where: { name: "Needs a person" } })).toBe(0);
    await expect(
      withOrg(a.org.id, a.user.id, (tx) =>
        tx.deal.create({
          data: {
            orgId: a.org.id,
            name: "App orphan",
            amountCents: 100,
            stageId: stage.id,
            companyId: company.id,
            ownerId: a.user.id,
          },
        }),
      ),
    ).rejects.toThrow(/deal_requires_contact/);
    expect(await admin.deal.count({ where: { name: "App orphan" } })).toBe(0);

    await expect(
      withOrg(a.org.id, a.user.id, async (tx) => {
        const deal = await tx.deal.create({
          data: {
            orgId: a.org.id,
            name: "Mismatch",
            amountCents: 100,
            stageId: stage.id,
            companyId: company.id,
            ownerId: a.user.id,
          },
          select: { id: true },
        });
        await tx.dealContact.create({
          data: { orgId: a.org.id, dealId: deal.id, contactId: contact.id, companyId: other.id },
        });
      }),
    ).rejects.toThrow(/company|foreign key|mismatch/i);

    await expect(
      withOrg(a.org.id, a.user.id, (tx) =>
        tx.contact.create({
          data: {
            orgId: a.org.id,
            firstName: "Cross",
            lastName: "Org",
            companyId: bCompany.id,
            ownerId: a.user.id,
          },
        }),
      ),
    ).rejects.toThrow(/foreign key|violates/i);

    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.org_id', ${a.org.id}, true)`;
        await tx.$executeRaw`SELECT set_config('app.user_id', ${a.user.id}, true)`;
        await tx.$executeRaw`
          INSERT INTO "Company" (id, "orgId", name, "ownerId", "createdAt", "updatedAt")
          VALUES (gen_random_uuid(), ${b.org.id}::uuid, 'Stolen', ${b.user.id}::uuid, now(), now())
        `;
      }),
    ).rejects.toThrow();
  });
});
