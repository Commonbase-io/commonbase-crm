import pg from "pg";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as login } from "@/app/api/auth/login/route";
import { DELETE as archiveCompany } from "@/app/api/companies/[id]/route";
import { POST as createContact } from "@/app/api/contacts/route";
import { DELETE as archiveContact, PATCH as patchContact } from "@/app/api/contacts/[id]/route";
import { POST as createDeal } from "@/app/api/deals/route";
import { POST as importContacts } from "@/app/api/import/contacts/route";
import { clearWriteBarriers, setWriteBarrier } from "@/lib/crm/write-barrier";
import { admin, call, makeOrg, resetDb, sessionCookie } from "../helpers/db";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  clearWriteBarriers();
  await resetDb();
});

afterEach(() => {
  clearWriteBarriers();
});

async function signIn(email: string) {
  const response = await call(login, "/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password: "Password1" }),
  });
  return sessionCookie(response.cookie);
}

function hold() {
  let release!: () => void;
  let arrived!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const ready = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  return {
    ready,
    release,
    wait: async () => {
      arrived();
      await gate;
    },
  };
}

async function until(ready: Promise<void>) {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("barrier was not reached")), 8000);
  });
  await Promise.race([ready, timeout]);
}

describe("hierarchy races", () => {
  it("does not archive the only contact of a deal created in the same moment", async () => {
    const { org, user } = await makeOrg({ name: "Race", slug: "race", email: "ada@example.com" });
    const stage = await admin.stage.findFirstOrThrow({ where: { orgId: org.id, name: "Lead" } });
    const company = await admin.company.create({ data: { orgId: org.id, name: "Race Co", ownerId: user.id } });
    const contact = await admin.contact.create({
      data: { orgId: org.id, firstName: "Pat", lastName: "Race", companyId: company.id, ownerId: user.id },
    });
    const cookie = await signIn("ada@example.com");
    const gate = hold();
    setWriteBarrier("contact-archive", () => gate.wait());

    const archiveP = call(archiveContact, `/api/contacts/${contact.id}`, {
      method: "DELETE",
      cookie,
      params: { id: contact.id },
    });
    await until(gate.ready);
    const created = await call(createDeal, "/api/deals", {
      method: "POST",
      cookie,
      body: JSON.stringify({
        name: "Landed during archive",
        amount: "10.00",
        stageId: stage.id,
        companyId: company.id,
        contactIds: [contact.id],
      }),
    });
    gate.release();
    const archived = await archiveP;

    expect(created.status).toBe(201);
    expect(archived.status).toBe(400);
    expect(archived.status).not.toBe(403);
    const stored = await admin.contact.findUniqueOrThrow({ where: { id: contact.id } });
    expect(stored.archivedAt).toBeNull();
    const deal = await admin.deal.findFirstOrThrow({ where: { name: "Landed during archive" } });
    expect(deal.archivedAt).toBeNull();
    expect(await admin.dealContact.count({ where: { dealId: deal.id, contactId: contact.id } })).toBe(1);
  });

  it("rejects a raw deal for a contact that was archived after the read", async () => {
    const { org, user } = await makeOrg({ name: "Race", slug: "race", email: "ada@example.com" });
    const stage = await admin.stage.findFirstOrThrow({ where: { orgId: org.id, name: "Lead" } });
    const company = await admin.company.create({ data: { orgId: org.id, name: "Race Co", ownerId: user.id } });
    const contact = await admin.contact.create({
      data: { orgId: org.id, firstName: "Pat", lastName: "Race", companyId: company.id, ownerId: user.id },
    });
    const cookie = await signIn("ada@example.com");
    const archived = await call(archiveContact, `/api/contacts/${contact.id}`, {
      method: "DELETE",
      cookie,
      params: { id: contact.id },
    });
    expect(archived.status).toBe(200);

    const client = await pool.connect();
    const dealId = crypto.randomUUID();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.org_id', $1, true)", [org.id]);
      await client.query("SELECT set_config('app.user_id', $1, true)", [user.id]);
      const seen = await client.query(`SELECT id FROM "Contact" WHERE id = $1`, [contact.id]);
      expect(seen.rows).toHaveLength(1);
      await client.query(
        `INSERT INTO "Deal" (id, "orgId", name, "amountCents", currency, "stageId", "companyId", "ownerId", status, "createdAt", "updatedAt")
         VALUES ($1, $2, 'Late', 100, 'USD', $3, $4, $5, 'OPEN', now(), now())`,
        [dealId, org.id, stage.id, company.id, user.id],
      );
      await client.query(
        `INSERT INTO "DealContact" ("orgId", "dealId", "contactId", "companyId")
         VALUES ($1, $2, $3, $4)`,
        [org.id, dealId, contact.id, company.id],
      );
      await expect(client.query("COMMIT")).rejects.toThrow(/deal_contact_archived/);
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }
    expect(await admin.deal.count({ where: { id: dealId } })).toBe(0);
  });

  it("still allows archiving both people on a deal, one after the other", async () => {
    const { org, user } = await makeOrg({ name: "Race", slug: "race", email: "ada@example.com" });
    const stage = await admin.stage.findFirstOrThrow({ where: { orgId: org.id, name: "Lead" } });
    const company = await admin.company.create({ data: { orgId: org.id, name: "Race Co", ownerId: user.id } });
    const pat = await admin.contact.create({
      data: { orgId: org.id, firstName: "Pat", lastName: "One", companyId: company.id, ownerId: user.id },
    });
    const sam = await admin.contact.create({
      data: { orgId: org.id, firstName: "Sam", lastName: "Two", companyId: company.id, ownerId: user.id },
    });
    await admin.$transaction(async (tx) => {
      const deal = await tx.deal.create({
        data: { orgId: org.id, name: "Shared", amountCents: 100, stageId: stage.id, companyId: company.id, ownerId: user.id },
      });
      await tx.dealContact.createMany({
        data: [
          { orgId: org.id, dealId: deal.id, contactId: pat.id, companyId: company.id },
          { orgId: org.id, dealId: deal.id, contactId: sam.id, companyId: company.id },
        ],
      });
    });
    const cookie = await signIn("ada@example.com");
    const first = await call(archiveContact, `/api/contacts/${pat.id}`, {
      method: "DELETE",
      cookie,
      params: { id: pat.id },
    });
    const second = await call(archiveContact, `/api/contacts/${sam.id}`, {
      method: "DELETE",
      cookie,
      params: { id: sam.id },
    });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const deal = await admin.deal.findFirstOrThrow({ where: { name: "Shared" } });
    expect(deal.archivedAt).toBeNull();
    expect(await admin.dealContact.count({ where: { dealId: deal.id } })).toBe(2);
  });

  it("does not archive a company that gained a contact in the same moment", async () => {
    const { org, user } = await makeOrg({ name: "Race", slug: "race", email: "ada@example.com" });
    const company = await admin.company.create({ data: { orgId: org.id, name: "Empty Co", ownerId: user.id } });
    const cookie = await signIn("ada@example.com");
    setWriteBarrier("company-archive", async () => {
      const created = await call(createContact, "/api/contacts", {
        method: "POST",
        cookie,
        body: JSON.stringify({ firstName: "Pat", lastName: "Late", companyId: company.id }),
      });
      expect(created.status).toBe(201);
    });
    const archived = await call(archiveCompany, `/api/companies/${company.id}`, {
      method: "DELETE",
      cookie,
      params: { id: company.id },
    });
    expect(archived.status).toBe(400);
    expect(archived.status).not.toBe(403);
    const stored = await admin.company.findUniqueOrThrow({ where: { id: company.id } });
    expect(stored.archivedAt).toBeNull();
    expect(await admin.contact.count({ where: { companyId: company.id, archivedAt: null } })).toBe(1);
  });

  it("does not save a contact onto a company archived after the check", async () => {
    const { org, user } = await makeOrg({ name: "Race", slug: "race", email: "ada@example.com" });
    const company = await admin.company.create({ data: { orgId: org.id, name: "Empty Co", ownerId: user.id } });
    const cookie = await signIn("ada@example.com");
    setWriteBarrier("contact-create", async () => {
      const archived = await call(archiveCompany, `/api/companies/${company.id}`, {
        method: "DELETE",
        cookie,
        params: { id: company.id },
      });
      expect(archived.status).toBe(200);
    });
    const created = await call(createContact, "/api/contacts", {
      method: "POST",
      cookie,
      body: JSON.stringify({ firstName: "Pat", lastName: "Late", companyId: company.id }),
    });
    expect(created.status).toBe(404);
    expect(created.status).not.toBe(403);
    expect(await admin.contact.count({ where: { companyId: company.id } })).toBe(0);
    const stored = await admin.company.findUniqueOrThrow({ where: { id: company.id } });
    expect(stored.archivedAt).not.toBeNull();
  });

  it("rejects a raw contact and deal written onto a company that was archived", async () => {
    const { org, user } = await makeOrg({ name: "Race", slug: "race", email: "ada@example.com" });
    const stage = await admin.stage.findFirstOrThrow({ where: { orgId: org.id, name: "Lead" } });
    const company = await admin.company.create({ data: { orgId: org.id, name: "Empty Co", ownerId: user.id } });
    const cookie = await signIn("ada@example.com");
    const archived = await call(archiveCompany, `/api/companies/${company.id}`, {
      method: "DELETE",
      cookie,
      params: { id: company.id },
    });
    expect(archived.status).toBe(200);

    const client = await pool.connect();
    const contactId = crypto.randomUUID();
    const dealId = crypto.randomUUID();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.org_id', $1, true)", [org.id]);
      await client.query("SELECT set_config('app.user_id', $1, true)", [user.id]);
      await client.query(
        `INSERT INTO "Contact" (id, "orgId", "firstName", "lastName", "companyId", "ownerId", "createdAt", "updatedAt")
         VALUES ($1, $2, 'Pat', 'Late', $3, $4, now(), now())`,
        [contactId, org.id, company.id, user.id],
      );
      await client.query(
        `INSERT INTO "Deal" (id, "orgId", name, "amountCents", currency, "stageId", "companyId", "ownerId", status, "createdAt", "updatedAt")
         VALUES ($1, $2, 'Late', 100, 'USD', $3, $4, $5, 'OPEN', now(), now())`,
        [dealId, org.id, stage.id, company.id, user.id],
      );
      await client.query(
        `INSERT INTO "DealContact" ("orgId", "dealId", "contactId", "companyId") VALUES ($1, $2, $3, $4)`,
        [org.id, dealId, contactId, company.id],
      );
      await expect(client.query("COMMIT")).rejects.toThrow(/company_archived/);
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }
    expect(await admin.contact.count({ where: { id: contactId } })).toBe(0);
    expect(await admin.deal.count({ where: { id: dealId } })).toBe(0);
  });

  it("does not import a contact onto a company archived during the import", async () => {
    const { org, user } = await makeOrg({ name: "Race", slug: "race", email: "ada@example.com" });
    const company = await admin.company.create({
      data: { orgId: org.id, name: "Empty Co", domain: "empty.example", ownerId: user.id },
    });
    const cookie = await signIn("ada@example.com");
    setWriteBarrier("contact-import", async () => {
      const archived = await call(archiveCompany, `/api/companies/${company.id}`, {
        method: "DELETE",
        cookie,
        params: { id: company.id },
      });
      expect(archived.status).toBe(200);
    });
    const imported = await call(importContacts, "/api/import/contacts", {
      method: "POST",
      cookie,
      body: JSON.stringify({
        csv: "firstName,lastName,email,companyDomain\nPat,Late,pat@empty.example,empty.example",
        mapping: { firstName: "firstName", lastName: "lastName", email: "email", companyDomain: "companyDomain" },
      }),
    });
    expect(imported.status).toBe(404);
    expect(imported.status).not.toBe(403);
    expect(await admin.contact.count({ where: { email: "pat@empty.example" } })).toBe(0);
    const stored = await admin.company.findUniqueOrThrow({ where: { id: company.id } });
    expect(stored.archivedAt).not.toBeNull();
  });

  it("returns a field error when a deal is added while a contact changes company", async () => {
    const { org, user } = await makeOrg({ name: "Race", slug: "race", email: "ada@example.com" });
    const stage = await admin.stage.findFirstOrThrow({ where: { orgId: org.id, name: "Lead" } });
    const company = await admin.company.create({ data: { orgId: org.id, name: "From Co", ownerId: user.id } });
    const other = await admin.company.create({ data: { orgId: org.id, name: "To Co", ownerId: user.id } });
    const contact = await admin.contact.create({
      data: { orgId: org.id, firstName: "Pat", lastName: "Move", companyId: company.id, ownerId: user.id },
    });
    const cookie = await signIn("ada@example.com");
    const gate = hold();
    setWriteBarrier("contact-reassign", () => gate.wait());

    const updateP = call(patchContact, `/api/contacts/${contact.id}`, {
      method: "PATCH",
      cookie,
      params: { id: contact.id },
      body: JSON.stringify({ firstName: "Pat", lastName: "Move", companyId: other.id }),
    });
    await until(gate.ready);
    const dealP = call(createDeal, "/api/deals", {
      method: "POST",
      cookie,
      body: JSON.stringify({
        name: "During move",
        amount: "10.00",
        stageId: stage.id,
        companyId: company.id,
        contactIds: [contact.id],
      }),
    });
    const outcome = await Promise.race([
      dealP.then((result) => ({ kind: "finished" as const, result })),
      (async () => {
        const started = Date.now();
        while (Date.now() - started < 3000) {
          // Row-lock waits show up as an ungranted transactionid lock on the
          // session that is blocked in SELECT ... FOR UPDATE.
          const waiting = await admin.$queryRaw<Array<{ pid: number }>>`
            SELECT a.pid
            FROM pg_stat_activity a
            JOIN pg_locks l ON l.pid = a.pid AND NOT l.granted
            WHERE a.query ILIKE '%FOR UPDATE%' AND a.query ILIKE '%"Contact"%'
          `;
          if (waiting.length > 0) return { kind: "blocked" as const };
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        return { kind: "timeout" as const };
      })(),
    ]);
    gate.release();
    const updated = await updateP;
    const created = outcome.kind === "finished" ? outcome.result : await dealP;

    expect(outcome.kind).toBe("blocked");
    expect(updated.status).toBe(200);
    expect(created.status).toBe(400);
    expect(created.status).not.toBe(500);
    const stored = await admin.contact.findUniqueOrThrow({ where: { id: contact.id } });
    expect(stored.companyId).toBe(other.id);
    expect(await admin.deal.count({ where: { name: "During move" } })).toBe(0);
    const links = await admin.dealContact.findMany({
      where: { orgId: org.id },
      include: { deal: true, contact: true },
    });
    expect(links.every((link) => link.companyId === link.deal.companyId && link.companyId === link.contact.companyId)).toBe(
      true,
    );
  });

  it("keeps hierarchy triggers invoker-owned by a nologin role", async () => {
    const rows = await admin.$queryRaw<
      Array<{ proname: string; prosecdef: boolean; rolname: string; rolcanlogin: boolean; rolbypassrls: boolean }>
    >`
      SELECT p.proname, p.prosecdef, r.rolname, r.rolcanlogin, r.rolbypassrls
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      JOIN pg_roles r ON r.oid = p.proowner
      WHERE n.nspname = 'public'
        AND p.proname IN ('enforce_deal_hierarchy', 'enforce_company_archive')
      ORDER BY p.proname
    `;
    expect(rows.map((row) => row.proname)).toEqual(["enforce_company_archive", "enforce_deal_hierarchy"]);
    for (const row of rows) {
      expect(row.prosecdef).toBe(false);
      expect(row.rolname).toBe("crm_owner");
      expect(row.rolcanlogin).toBe(false);
      expect(row.rolbypassrls).toBe(false);
    }
  });
});
