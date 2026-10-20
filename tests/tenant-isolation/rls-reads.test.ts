import { describe, expect, it } from "vitest";
import { SEED, T, U, as, asUser, attempt } from "../support/db";

const TENANT_TABLES = [
  "provider_connections",
  "mailboxes",
  "companies",
  "company_trigger_events",
  "contacts",
  "suppression_entries",
  "campaigns",
  "sequence_steps",
  "campaign_contacts",
  "activities",
  "opportunities",
  "notes",
  "tasks",
  "memberships",
] as const;

describe("RLS reads", () => {
  it("a tenant B member sees only tenant B rows in every tenant-owned table", async () => {
    await asUser(U.harborAdmin, async (db) => {
      for (const table of TENANT_TABLES) {
        const { rows } = await db.query(`select distinct tenant_id from public.${table}`);
        expect(rows.map((r) => r.tenant_id), table).not.toContain(T.brs);
      }
    });
  });

  it("a tenant A rep cannot read tenant B records by guessed id", async () => {
    await asUser(U.brsRep, async (db) => {
      const checks: [string, string][] = [
        ["companies", SEED.harborCompany],
        ["contacts", SEED.harborContact],
        ["opportunities", SEED.harborOpportunity],
        ["mailboxes", SEED.harborMailbox],
      ];
      for (const [table, id] of checks) {
        const { rowCount } = await db.query(`select id from public.${table} where id = $1`, [id]);
        expect(rowCount, table).toBe(0);
      }
      const conn = await db.query("select id from public.provider_connections where id = $1", [SEED.harborConnection]);
      expect(conn.rowCount).toBe(0);
    });
  });

  it("only lists tenants the user belongs to", async () => {
    const slugs = async (userId: string) =>
      asUser(userId, async (db) => (await db.query("select slug from public.tenants order by slug")).rows.map((r) => r.slug));
    expect(await slugs(U.brsRep)).toEqual(["brs"]);
    expect(await slugs(U.harborRep)).toEqual(["harbor-demo"]);
    expect(await slugs(U.staff)).toEqual(["brs", "harbor-demo"]);
  });

  it("hides profiles of users who share no tenant", async () => {
    await asUser(U.harborRep, async (db) => {
      const { rows } = await db.query("select id from public.profiles");
      const ids = rows.map((r) => r.id);
      expect(ids).toContain(U.harborAdmin);
      expect(ids).not.toContain(U.brsRep);
    });
  });

  it("never lets the authenticated role read credential_ref, even in its own tenant", async () => {
    await asUser(U.brsAdmin, async (db) => {
      const res = await attempt(db, "select credential_ref from public.provider_connections");
      expect(res.code).toBe("42501"); // insufficient_privilege
      const star = await attempt(db, "select * from public.provider_connections");
      expect(star.code).toBe("42501");
      const ok = await db.query("select id, status, account_holder from public.provider_connections");
      expect(ok.rows).toEqual([{ id: SEED.brsConnection, status: "connected", account_holder: "commonbase" }]);
    });
  });

  it("gives anon nothing", async () => {
    await as({ role: "anon" }, async (db) => {
      for (const table of ["tenants", "companies", "contacts", "provider_connections"]) {
        const res = await attempt(db, `select 1 from public.${table}`);
        expect(res.code, table).toBe("42501");
      }
    });
  });

  it("hides idempotency keys from every authenticated user and audit logs from non-admins", async () => {
    await asUser(U.brsAdmin, async (db) => {
      expect((await attempt(db, "select 1 from public.idempotency_keys")).code).toBe("42501");
      expect((await db.query("select 1 from public.audit_logs")).rowCount).toBeGreaterThan(0);
    });
    await asUser(U.brsRep, async (db) => {
      expect((await db.query("select 1 from public.audit_logs")).rowCount).toBe(0);
      expect((await db.query("select 1 from public.sync_jobs")).rowCount).toBe(0);
    });
  });
});
