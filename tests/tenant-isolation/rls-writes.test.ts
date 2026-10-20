import { describe, expect, it } from "vitest";
import { SEED, T, U, asService, asUser, attempt } from "../support/db";

describe("RLS writes", () => {
  it("blocks inserting rows into another tenant", async () => {
    await asUser(U.brsAdmin, async (db) => {
      const res = await attempt(db, "insert into public.companies (tenant_id, name) values ($1, 'Injected')", [T.harbor]);
      expect(res.code).toBe("42501"); // new row violates row-level security policy
      const contact = await attempt(db, "insert into public.contacts (tenant_id, name) values ($1, 'Injected')", [T.harbor]);
      expect(contact.code).toBe("42501");
    });
  });

  it("silently matches zero rows when updating or deleting another tenant's records by id", async () => {
    await asUser(U.brsAdmin, async (db) => {
      const upd = await attempt(db, "update public.companies set name = 'pwned' where id = $1", [SEED.harborCompany]);
      expect(upd).toEqual({ rowCount: 0 });
      const del = await attempt(db, "delete from public.contacts where id = $1", [SEED.harborContact]);
      expect(del).toEqual({ rowCount: 0 });
    });
    await asService(async (db) => {
      const { rows } = await db.query("select name from public.companies where id = $1", [SEED.harborCompany]);
      expect(rows[0]?.name).toBe("Riverbend Logistics");
    });
  });

  it("cannot move a row into another tenant", async () => {
    await asUser(U.staff, async (db) => {
      // Staff is admin in both tenants, so RLS alone would allow this; the
      // composite foreign keys still refuse to orphan cross-tenant references.
      const res = await attempt(db, "update public.companies set tenant_id = $1 where id = $2", [T.harbor, SEED.brsCompany]);
      expect(res.code).toBe("23503"); // foreign_key_violation (contacts/opportunities still point at it)
    });
  });

  it("composite foreign keys stop cross-tenant references even for the service role", async () => {
    await asService(async (db) => {
      const contact = await attempt(db, "insert into public.contacts (tenant_id, company_id, name) values ($1, $2, 'x')", [
        T.brs,
        SEED.harborCompany,
      ]);
      expect(contact.code).toBe("23503");

      const opp = await attempt(
        db,
        "insert into public.opportunities (tenant_id, company_id, owner_id, title) values ($1, $2, $3, 'x')",
        [T.brs, SEED.brsCompany, U.harborRep],
      );
      expect(opp.code).toBe("23503"); // owner must be a member of the same tenant

      const campaign = await attempt(
        db,
        "insert into public.campaigns (tenant_id, provider_connection_id, mailbox_id, name) values ($1, $2, $3, 'x')",
        [T.brs, SEED.brsConnection, SEED.harborMailbox],
      );
      expect(campaign.code).toBe("23503");

      const note = await attempt(
        db,
        "insert into public.notes (tenant_id, entity_type, entity_id, body) values ($1, 'contact', $2, 'x')",
        [T.brs, SEED.harborContact],
      );
      expect(note.code).toBe("23503");
    });
  });

  it("dedupes per tenant: the same domain may exist once in each tenant", async () => {
    await asService(async (db) => {
      const { rows } = await db.query("select tenant_id from public.companies where domain = 'shared-domain.example' order by tenant_id");
      expect(rows.map((r) => r.tenant_id)).toEqual([T.brs, T.harbor]);
      const dup = await attempt(db, "insert into public.companies (tenant_id, name, domain) values ($1, 'dup', 'shared-domain.example')", [T.brs]);
      expect(dup.code).toBe("23505");
      const dupEmail = await attempt(db, "insert into public.contacts (tenant_id, name, email) values ($1, 'dup', ' DANA@Lumen-Ledger.example ')", [T.brs]);
      expect(dupEmail.code).toBe("23505");
    });
  });

  it("enforces one active Apollo connection per tenant", async () => {
    await asService(async (db) => {
      const res = await attempt(
        db,
        "insert into public.provider_connections (tenant_id, provider, account_holder, billing_party, status) values ($1, 'apollo', 'client', 'client', 'pending')",
        [T.brs],
      );
      expect(res.code).toBe("23505");
      const disconnected = await attempt(
        db,
        "insert into public.provider_connections (tenant_id, provider, account_holder, billing_party, status) values ($1, 'apollo', 'client', 'client', 'disconnected')",
        [T.brs],
      );
      expect(disconnected.error).toBeUndefined();
    });
  });

  it("refuses a connected live connection without recorded authorization", async () => {
    await asService(async (db) => {
      const res = await attempt(db, "update public.provider_connections set mode = 'live', credential_ref = null where id = $1", [SEED.brsConnection]);
      expect(res.code).toBe("23514");
    });
  });

  it("does not let members write provider connections", async () => {
    await asUser(U.brsAdmin, async (db) => {
      const res = await attempt(db, "update public.provider_connections set status = 'revoked' where id = $1", [SEED.brsConnection]);
      expect(res.code).toBe("42501");
    });
  });
});

describe("membership and role rules", () => {
  it("only tenant_admin manages memberships", async () => {
    await asUser(U.brsManager, async (db) => {
      const res = await attempt(db, "update public.memberships set role = 'sales_manager' where tenant_id = $1 and user_id = $2", [T.brs, U.brsRep]);
      expect(res).toEqual({ rowCount: 0 });
      const ins = await attempt(db, "insert into public.memberships (tenant_id, user_id, role) values ($1, $2, 'sales_rep')", [T.brs, U.harborRep]);
      expect(ins.code).toBe("42501");
    });
    await asUser(U.brsAdmin, async (db) => {
      const res = await attempt(db, "update public.memberships set role = 'sales_manager' where tenant_id = $1 and user_id = $2", [T.brs, U.brsRep]);
      expect(res).toEqual({ rowCount: 1 });
    });
  });

  it("members, admins included, cannot change or delete their own membership", async () => {
    for (const userId of [U.brsRep, U.brsAdmin]) {
      await asUser(userId, async (db) => {
        const upd = await attempt(db, "update public.memberships set role = 'tenant_admin' where user_id = $1", [userId]);
        expect(upd).toEqual({ rowCount: 0 });
        const del = await attempt(db, "delete from public.memberships where user_id = $1", [userId]);
        expect(del).toEqual({ rowCount: 0 });
      });
    }
  });

  it("an admin of tenant A cannot touch tenant B memberships", async () => {
    await asUser(U.brsAdmin, async (db) => {
      const res = await attempt(db, "delete from public.memberships where tenant_id = $1", [T.harbor]);
      expect(res).toEqual({ rowCount: 0 });
    });
  });

  it("memberships cannot be moved to another tenant or user", async () => {
    await asUser(U.staff, async (db) => {
      const res = await attempt(db, "update public.memberships set tenant_id = $1 where tenant_id = $2 and user_id = $3", [T.harbor, T.brs, U.brsRep]);
      expect(res.code).toBe("42501"); // column not granted
    });
  });

  it("reps edit only their own opportunities and cannot reassign them", async () => {
    await asUser(U.brsRep, async (db) => {
      const own = await attempt(db, "update public.opportunities set estimated_value = 1 where id = $1", [SEED.brsRepOpportunity]);
      expect(own).toEqual({ rowCount: 1 });
      const other = await attempt(db, "update public.opportunities set estimated_value = 1 where id = $1", [SEED.brsManagerOpportunity]);
      expect(other).toEqual({ rowCount: 0 });
      const reassign = await attempt(db, "update public.opportunities set owner_id = $1 where id = $2", [U.brsManager, SEED.brsRepOpportunity]);
      expect(reassign.code).toBe("42501");
    });
    await asUser(U.brsManager, async (db) => {
      const res = await attempt(db, "update public.opportunities set owner_id = $1 where id = $2", [U.brsManager, SEED.brsRepOpportunity]);
      expect(res).toEqual({ rowCount: 1 });
    });
  });

  it("requires a lost_reason when an opportunity moves to lost", async () => {
    await asUser(U.brsManager, async (db) => {
      const res = await attempt(db, "update public.opportunities set stage = 'lost' where id = $1", [SEED.brsManagerOpportunity]);
      expect(res.code).toBe("23514");
      const ok = await attempt(db, "update public.opportunities set stage = 'lost', lost_reason = 'Budget' where id = $1", [SEED.brsManagerOpportunity]);
      expect(ok).toEqual({ rowCount: 1 });
      const { rows } = await db.query("select closed_at from public.opportunities where id = $1", [SEED.brsManagerOpportunity]);
      expect(rows[0]?.closed_at).not.toBeNull();
    });
  });

  it("reps can add suppressions but only admins remove them", async () => {
    await asUser(U.brsRep, async (db) => {
      const ins = await attempt(
        db,
        "insert into public.suppression_entries (tenant_id, scope, value_hash, source) values ($1, 'email', app.suppression_hash('new@x.example'), 'manual')",
        [T.brs],
      );
      expect(ins.error).toBeUndefined();
      const del = await attempt(db, "delete from public.suppression_entries where tenant_id = $1", [T.brs]);
      expect(del).toEqual({ rowCount: 0 });
    });
  });
});
