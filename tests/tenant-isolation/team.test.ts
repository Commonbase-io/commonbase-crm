import { describe, expect, it } from "vitest";
import { T, U, asService, asUser, attempt } from "../support/db";

// Seed: BRS admins = staff + brsAdmin; Harbor admins = staff + harborAdmin.

describe("team management (database)", () => {
  it("never lets a workspace lose its last admin, even via the service role", async () => {
    await asService(async (db) => {
      const first = await attempt(db, "delete from public.memberships where tenant_id = $1 and user_id = $2", [T.harbor, U.staff]);
      expect(first).toEqual({ rowCount: 1 }); // one admin left: fine
      const last = await attempt(db, "delete from public.memberships where tenant_id = $1 and user_id = $2", [T.harbor, U.harborAdmin]);
      expect(last.error).toContain("at least one admin");
      const demote = await attempt(db, "update public.memberships set role = 'sales_rep' where tenant_id = $1 and user_id = $2", [T.harbor, U.harborAdmin]);
      expect(demote.error).toContain("at least one admin");
    });
  });

  it("blocks removing every admin in one statement", async () => {
    await asService(async (db) => {
      const res = await attempt(db, "delete from public.memberships where tenant_id = $1 and role = 'tenant_admin'", [T.brs]);
      expect(res.error).toContain("at least one admin");
    });
  });

  it("an admin can demote or remove another admin while one remains", async () => {
    await asUser(U.brsAdmin, async (db) => {
      const res = await attempt(db, "update public.memberships set role = 'sales_manager' where tenant_id = $1 and user_id = $2", [T.brs, U.staff]);
      expect(res).toEqual({ rowCount: 1 });
    });
  });

  it("other roles' changes are unaffected", async () => {
    await asUser(U.brsAdmin, async (db) => {
      expect(await attempt(db, "delete from public.memberships where tenant_id = $1 and user_id = $2", [T.brs, U.brsRep])).toEqual({ rowCount: 1 });
    });
  });

  it("still lets a whole tenant be deleted", async () => {
    await asService(async (db) => {
      expect(await attempt(db, "delete from public.tenants where id = $1", [T.harbor])).toEqual({ rowCount: 1 });
    });
  });

  it("account lookups are server only and tenant scoped", async () => {
    await asUser(U.brsAdmin, async (db) => {
      expect((await attempt(db, "select public.find_auth_user_id('rep@brs-demo.example')")).code).toBe("42501");
      expect((await attempt(db, "select * from public.tenant_member_accounts($1)", [T.brs])).code).toBe("42501");
    });
    await asService(async (db) => {
      const { rows } = await db.query("select public.find_auth_user_id(' REP@brs-demo.example ') as id");
      expect(rows[0]?.id).toBe(U.brsRep);
      const members = await db.query("select user_id, email from public.tenant_member_accounts($1) order by email", [T.harbor]);
      expect(members.rows.map((r) => r.email)).toEqual(["admin@harbor-demo.example", "rep@harbor-demo.example", "staff@commonbase.example"]);
    });
  });
});
