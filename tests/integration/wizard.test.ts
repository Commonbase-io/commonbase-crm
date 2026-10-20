import { beforeEach, describe, expect, it } from "vitest";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as createContact } from "@/app/api/contacts/route";
import { POST as createDealWizard } from "@/app/api/deals/wizard/route";
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

describe("create wizards", () => {
  it("saves a new company, contact, and deal in one transaction", async () => {
    const { org } = await makeOrg({ name: "Wizard", slug: "wizard", email: "ada@example.com" });
    const stage = await admin.stage.findFirstOrThrow({ where: { orgId: org.id, name: "Qualified" } });
    const cookie = await signIn("ada@example.com");
    const response = await call(createDealWizard, "/api/deals/wizard", {
      method: "POST",
      cookie,
      body: JSON.stringify({
        company: { mode: "create", name: "Wizard Bakery", domain: "wizard-bakery.example" },
        contact: { mode: "create", firstName: "Pat", lastName: "Baker", email: "pat@wizard-bakery.example" },
        deal: { name: "Oven install", amount: "1200.50", currency: "USD", stageId: stage.id },
      }),
    });
    expect(response.status).toBe(201);
    const deal = await admin.deal.findUniqueOrThrow({
      where: { id: response.body.id },
      include: { company: true, dealContacts: { include: { contact: true } } },
    });
    expect(deal.company.name).toBe("Wizard Bakery");
    expect(deal.companyId).toBe(response.body.companyId);
    expect(deal.dealContacts).toHaveLength(1);
    expect(deal.dealContacts[0]?.contact.email).toBe("pat@wizard-bakery.example");
    expect(deal.dealContacts[0]?.companyId).toBe(deal.companyId);
    expect(deal.amountCents).toBe(120050);
  });

  it("rolls back the company and contact when a later step fails", async () => {
    const { org, user } = await makeOrg({ name: "Wizard", slug: "wizard", email: "ada@example.com" });
    const company = await admin.company.create({
      data: { orgId: org.id, name: "Existing", domain: "existing.example", ownerId: user.id },
    });
    await admin.contact.create({
      data: {
        orgId: org.id,
        firstName: "Pat",
        lastName: "Existing",
        email: "pat@existing.example",
        companyId: company.id,
        ownerId: user.id,
      },
    });
    const cookie = await signIn("ada@example.com");
    const beforeCompanies = await admin.company.count({ where: { orgId: org.id } });
    const duplicateEmail = await call(createDealWizard, "/api/deals/wizard", {
      method: "POST",
      cookie,
      body: JSON.stringify({
        company: { mode: "create", name: "Should vanish", domain: "vanish.example" },
        contact: { mode: "create", firstName: "Pat", lastName: "Dup", email: "pat@existing.example" },
        deal: { name: "Should vanish", amount: "10.00", stageId: "11111111-1111-4111-8111-111111111111" },
      }),
    });
    expect(duplicateEmail.status).toBe(400);
    expect(duplicateEmail.body.error).not.toBe("Validation failed");
    expect(duplicateEmail.body.fieldErrors.email).toMatch(/email/i);
    expect(await admin.company.count({ where: { orgId: org.id } })).toBe(beforeCompanies);
    expect(await admin.company.findFirst({ where: { domain: "vanish.example" } })).toBeNull();
    expect(await admin.deal.count({ where: { orgId: org.id } })).toBe(0);

    const missingStage = await call(createDealWizard, "/api/deals/wizard", {
      method: "POST",
      cookie,
      body: JSON.stringify({
        company: { mode: "create", name: "Also vanish", domain: "also-vanish.example" },
        contact: { mode: "create", firstName: "Sam", lastName: "New", email: "sam@also-vanish.example" },
        deal: { name: "No stage", amount: "10.00", stageId: "11111111-1111-4111-8111-111111111111" },
      }),
    });
    expect(missingStage.status).toBe(404);
    expect(await admin.company.findFirst({ where: { domain: "also-vanish.example" } })).toBeNull();
    expect(await admin.contact.findFirst({ where: { email: "sam@also-vanish.example" } })).toBeNull();
    expect(await admin.deal.count({ where: { orgId: org.id } })).toBe(0);
  });

  it("creates a contact and its company together, and rolls back when the contact is rejected", async () => {
    const { org, user } = await makeOrg({ name: "People", slug: "people", email: "ada@example.com" });
    const company = await admin.company.create({
      data: { orgId: org.id, name: "Existing", domain: "existing.example", ownerId: user.id },
    });
    await admin.contact.create({
      data: {
        orgId: org.id,
        firstName: "Pat",
        lastName: "Existing",
        email: "pat@existing.example",
        companyId: company.id,
        ownerId: user.id,
      },
    });
    const cookie = await signIn("ada@example.com");
    const created = await call(createContact, "/api/contacts", {
      method: "POST",
      cookie,
      body: JSON.stringify({
        firstName: "Sam",
        lastName: "New",
        email: "sam@fresh.example",
        company: { name: "Fresh Co", domain: "fresh.example" },
      }),
    });
    expect(created.status).toBe(201);
    expect(created.body.company.name).toBe("Fresh Co");
    const stored = await admin.contact.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(stored.companyId).toBe(created.body.companyId);

    const before = await admin.company.count({ where: { orgId: org.id } });
    const rejected = await call(createContact, "/api/contacts", {
      method: "POST",
      cookie,
      body: JSON.stringify({
        firstName: "Pat",
        lastName: "Dup",
        email: "pat@existing.example",
        company: { name: "Nope Co", domain: "nope.example" },
      }),
    });
    expect(rejected.status).toBe(400);
    expect(rejected.body.fieldErrors.email).toMatch(/email/i);
    expect(await admin.company.count({ where: { orgId: org.id } })).toBe(before);
    expect(await admin.company.findFirst({ where: { domain: "nope.example" } })).toBeNull();
  });
});
