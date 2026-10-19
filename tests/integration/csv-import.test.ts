import { beforeEach, describe, expect, it } from "vitest";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as importCompanies } from "@/app/api/import/companies/route";
import { POST as importContacts } from "@/app/api/import/contacts/route";
import { admin, call, makeOrg, resetDb, sessionCookie } from "../helpers/db";

beforeEach(async () => {
  await resetDb();
});

describe("csv import", () => {
  it("imports valid rows, reports invalid rows, neutralizes formulas, and dedupes", async () => {
    const { org, user } = await makeOrg({ name: "Import Org", slug: "import-org", email: "ada@example.com" });
    await admin.company.create({
      data: { orgId: org.id, name: "Existing", domain: "existing.example", ownerId: user.id },
    });
    const signedIn = await call(login, "/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "ada@example.com", password: "Password1" }),
    });
    const cookie = sessionCookie(signedIn.cookie);
    const csv = [
      "name,domain,phone,notes",
      "Good Bakery,good.example,555-0101,Hello",
      ",missing.example,555-0102,No name",
      "=cmd|'/c calc',formula.example,555-0103,@sum",
      "Duplicate,existing.example,555-0104,Skip",
      "Second,good.example,555-0105,Also skip",
    ].join("\n");
    const response = await call(importCompanies, "/api/import/companies", {
      method: "POST",
      cookie,
      body: JSON.stringify({
        csv,
        mapping: { name: "name", domain: "domain", phone: "phone", notes: "notes" },
      }),
    });
    expect(response.status).toBe(200);
    expect(response.body.created).toBe(2);
    const byDomain = Object.fromEntries(
      response.body.rows.map((row: { values: { domain: string }; status: string; errors: string[] }) => [row.values.domain, row]),
    );
    expect(byDomain["missing.example"].status).toBe("invalid");
    expect(byDomain["missing.example"].errors).toContain("Name is required");
    expect(byDomain["formula.example"].status).toBe("valid");
    expect(byDomain["existing.example"].status).toBe("duplicate");
    const good = response.body.rows.filter((row: { values: { domain: string } }) => row.values.domain === "good.example");
    expect(good.map((row: { status: string }) => row.status)).toEqual(["valid", "duplicate"]);

    const stored = await admin.company.findFirstOrThrow({ where: { domain: "formula.example" } });
    expect(stored.name).toBe("'=cmd|'/c calc'");
    expect(stored.notes).toBe("'@sum");

    const contacts = [
      "firstName,lastName,email,companyDomain",
      "Pat,Example,pat@good.example,good.example",
      "No,Email,not-an-email,good.example",
      "Dup,Example,pat@good.example,good.example",
      "Other,Person,other@missing.example,missing.example",
    ].join("\n");
    const contactResponse = await call(importContacts, "/api/import/contacts", {
      method: "POST",
      cookie,
      body: JSON.stringify({
        csv: contacts,
        mapping: { firstName: "firstName", lastName: "lastName", email: "email", companyDomain: "companyDomain" },
      }),
    });
    expect(contactResponse.body.created).toBe(1);
    const contactRows = contactResponse.body.rows;
    expect(contactRows[0].status).toBe("valid");
    expect(contactRows[1].status).toBe("invalid");
    expect(contactRows[2].status).toBe("duplicate");
    expect(contactRows[3].status).toBe("invalid");
    const pat = await admin.contact.findFirstOrThrow({ where: { email: "pat@good.example" } });
    expect(pat.companyId).toBeTruthy();
  });
});
