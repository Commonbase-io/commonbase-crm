import { execSync } from "node:child_process";
import { beforeEach, describe, expect, it } from "vitest";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as createDeal } from "@/app/api/deals/route";
import { POST as importCompanies } from "@/app/api/import/companies/route";
import { prisma, withOrg } from "@/lib/db";
import { admin, call, makeOrg, resetDb, sessionCookie } from "../helpers/db";

beforeEach(async () => {
  await resetDb();
});

describe("database guards", () => {
  it("matches schema.prisma after migrations", () => {
    const script = execSync(
      "npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script",
      { encoding: "utf8" },
    );
    const statements = script
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("--"));
    expect(statements).toEqual([]);
  });

  it("forces RLS, pins definer search_path, and keeps the app role off session tables", async () => {
    const tables = await admin.$queryRaw<Array<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean; owner: string }>>`
      SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity, pg_get_userbyid(c.relowner) AS owner
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> '_prisma_migrations'
      ORDER BY 1
    `;
    expect(tables.every((table) => table.relrowsecurity && table.relforcerowsecurity && table.owner === "crm_owner")).toBe(true);
    const roles = await admin.$queryRaw<Array<{ rolname: string; rolsuper: boolean; rolbypassrls: boolean; rolcanlogin: boolean }>>`
      SELECT rolname, rolsuper, rolbypassrls, rolcanlogin
      FROM pg_roles
      WHERE rolname IN ('crm_app', 'crm_owner', 'crm_definer')
    `;
    const byName = Object.fromEntries(roles.map((role) => [role.rolname, role]));
    expect(byName.crm_app).toMatchObject({ rolsuper: false, rolbypassrls: false, rolcanlogin: true });
    expect(byName.crm_owner).toMatchObject({ rolsuper: false, rolbypassrls: false, rolcanlogin: false });
    expect(byName.crm_definer).toMatchObject({ rolsuper: false, rolbypassrls: true, rolcanlogin: false });
    const grants = await admin.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.role_table_grants
      WHERE grantee = 'crm_app' AND table_name IN ('Session', 'LoginAttempt')
    `;
    expect(grants).toEqual([]);
    const functions = await admin.$queryRaw<Array<{ proname: string; prosecdef: boolean; proconfig: string[] | null }>>`
      SELECT p.proname, p.prosecdef, p.proconfig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
    `;
    expect(functions.every((fn) => fn.proconfig?.includes("search_path=pg_catalog, public"))).toBe(true);
    expect(functions.filter((fn) => fn.prosecdef).length).toBeGreaterThan(0);
  });

  it("rejects a deal contact that points at another organization", async () => {
    const a = await makeOrg({ name: "Org A", slug: "org-a", email: "a@example.com" });
    const b = await makeOrg({ name: "Org B", slug: "org-b", email: "b@example.com" });
    const stage = await admin.stage.findFirstOrThrow({ where: { orgId: a.org.id, name: "Lead" } });
    const aCompany = await admin.company.create({
      data: { orgId: a.org.id, name: "Local Co", ownerId: a.user.id },
    });
    const aContact = await admin.contact.create({
      data: { orgId: a.org.id, firstName: "Local", lastName: "Person", companyId: aCompany.id, ownerId: a.user.id },
    });
    const deal = await admin.$transaction(async (tx) => {
      const created = await tx.deal.create({
        data: { orgId: a.org.id, name: "Local", amountCents: 100, stageId: stage.id, companyId: aCompany.id, ownerId: a.user.id },
      });
      await tx.dealContact.create({
        data: { orgId: a.org.id, dealId: created.id, contactId: aContact.id, companyId: aCompany.id },
      });
      return created;
    });
    const bCompany = await admin.company.create({
      data: { orgId: b.org.id, name: "Other Co", ownerId: b.user.id },
    });
    const contact = await admin.contact.create({
      data: { orgId: b.org.id, firstName: "Other", lastName: "Org", companyId: bCompany.id, ownerId: b.user.id },
    });
    await expect(
      admin.dealContact.create({
        data: { orgId: a.org.id, dealId: deal.id, contactId: contact.id, companyId: aCompany.id },
      }),
    ).rejects.toThrow(/foreign key/i);
  });

  it("does not let the app role delete another user's sessions", async () => {
    const org = await makeOrg({ name: "Org A", slug: "org-a", email: "admin@example.com" });
    const member = await admin.user.create({
      data: {
        orgId: org.org.id,
        email: "member@example.com",
        name: "Member",
        passwordHash: org.user.passwordHash,
        role: "MEMBER",
      },
    });
    await admin.session.create({
      data: { userId: org.user.id, tokenHash: "a".repeat(64), expiresAt: new Date(Date.now() + 60_000) },
    });
    await expect(prisma.$executeRaw`SELECT delete_user_sessions(${org.user.id}::uuid)`).rejects.toThrow(/not_found/);
    await expect(
      withOrg(org.org.id, member.id, (tx) => tx.$executeRaw`SELECT delete_user_sessions(${org.user.id}::uuid)`),
    ).rejects.toThrow(/not_found/);
    expect(await admin.session.count({ where: { userId: org.user.id } })).toBe(1);
  });

  it("stores a phone number that starts with + and strips hidden formula prefixes", async () => {
    const { org } = await makeOrg({ name: "Import", slug: "import", email: "a@example.com" });
    const signedIn = await call(login, "/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "a@example.com", password: "Password1" }),
    });
    const csv = ["name,domain,phone,notes", "Plus Co,plus.example,+15550101,\u200B=HYPERLINK(http://evil)"].join("\n");
    const response = await call(importCompanies, "/api/import/companies", {
      method: "POST",
      cookie: sessionCookie(signedIn.cookie),
      body: JSON.stringify({
        csv,
        mapping: { name: "name", domain: "domain", phone: "phone", notes: "notes" },
      }),
    });
    expect(response.status).toBe(200);
    const stored = await admin.company.findFirstOrThrow({ where: { orgId: org.id, domain: "plus.example" } });
    expect(stored.phone).toBe("+15550101");
    expect(stored.notes?.startsWith("'=")).toBe(true);
    expect(stored.notes).not.toContain("\u200B");
  });

  it("rejects a currency code that is not a real currency", async () => {
    const { org } = await makeOrg({ name: "Money", slug: "money", email: "a@example.com" });
    const stage = await admin.stage.findFirstOrThrow({ where: { orgId: org.id, name: "Lead" } });
    const signedIn = await call(login, "/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "a@example.com", password: "Password1" }),
    });
    const response = await call(createDeal, "/api/deals", {
      method: "POST",
      cookie: sessionCookie(signedIn.cookie),
      body: JSON.stringify({ name: "Retainer", amount: "10.00", currency: "ABC", stageId: stage.id }),
    });
    expect(response.status).toBe(400);
    expect(response.body.fieldErrors.currency).toMatch(/currency/i);
  });
});
