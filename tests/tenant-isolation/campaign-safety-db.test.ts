import { describe, expect, it } from "vitest";
import { SEED, T, U, asService, asUser, attempt } from "../support/db";

// Database-level backstops. The application services enforce the same rules
// with friendlier errors (tests/integrations), but these hold even if a
// service has a bug or someone writes with the service role.

describe("campaign safety (database)", () => {
  it("refuses approval when an email step lacks an unsubscribe link", async () => {
    await asService(async (db) => {
      const res = await attempt(db, "update public.campaigns set status = 'approved', approved_by = $1, approved_at = now() where id = $2", [
        U.brsManager,
        SEED.brsNonCompliantDraft,
      ]);
      expect(res.code).toBe("23514");
      expect(res.error).toContain("unsubscribe_url");
    });
  });

  it("refuses approval when the tenant has no postal address", async () => {
    await asService(async (db) => {
      await db.query("update public.sequence_steps set body = body || ' {{unsubscribe_url}}' where campaign_id = $1", [SEED.brsNonCompliantDraft]);
      await db.query("update public.tenants set postal_address = null where id = $1", [T.brs]);
      const res = await attempt(db, "update public.campaigns set status = 'approved', approved_by = $1, approved_at = now() where id = $2", [
        U.brsManager,
        SEED.brsNonCompliantDraft,
      ]);
      expect(res.error).toContain("postal address");
    });
  });

  it("refuses approval without an approver", async () => {
    await asService(async (db) => {
      await db.query("update public.sequence_steps set body = body || ' {{unsubscribe_url}}' where campaign_id = $1", [SEED.brsNonCompliantDraft]);
      const res = await attempt(db, "update public.campaigns set status = 'approved' where id = $1", [SEED.brsNonCompliantDraft]);
      expect(res.code).toBe("23514");
    });
  });

  it("rejects skipping states (draft -> active)", async () => {
    await asService(async (db) => {
      const res = await attempt(db, "update public.campaigns set status = 'active', approved_by = $1, approved_at = now() where id = $2", [
        U.brsManager,
        SEED.brsNonCompliantDraft,
      ]);
      expect(res.error).toContain("invalid campaign transition");
    });
  });

  it("does not let managers change campaign status through the API role", async () => {
    await asUser(U.brsManager, async (db) => {
      const res = await attempt(db, "update public.campaigns set status = 'approved' where id = $1", [SEED.brsNonCompliantDraft]);
      expect(res.code).toBe("42501"); // status column not granted
      const rename = await attempt(db, "update public.campaigns set name = 'Renamed' where id = $1", [SEED.brsNonCompliantDraft]);
      expect(rename).toEqual({ rowCount: 1 });
      const activeRename = await attempt(db, "update public.campaigns set name = 'Renamed' where id = $1", [SEED.brsActiveCampaign]);
      expect(activeRename).toEqual({ rowCount: 0 }); // only drafts are editable
    });
    await asUser(U.brsRep, async (db) => {
      const res = await attempt(db, "update public.campaigns set name = 'Rep edit' where id = $1", [SEED.brsNonCompliantDraft]);
      expect(res).toEqual({ rowCount: 0 });
    });
  });

  it("freezes sequence steps once a campaign leaves draft", async () => {
    await asService(async (db) => {
      const res = await attempt(db, "update public.sequence_steps set body = 'changed' where campaign_id = $1", [SEED.brsActiveCampaign]);
      expect(res.error).toContain("only change while the campaign is a draft");
    });
  });

  it("blocks enrolling a suppressed email even with the service role", async () => {
    await asService(async (db) => {
      const res = await attempt(
        db,
        "insert into public.campaign_contacts (tenant_id, campaign_id, contact_id, enrollment_status) values ($1, $2, $3, 'enrolling')",
        [T.brs, SEED.brsActiveCampaign, SEED.brsOptedOutContact],
      );
      expect(res.error).toContain("suppressed");
    });
  });

  it("blocks enrolling a contact whose domain is suppressed", async () => {
    await asService(async (db) => {
      const res = await attempt(
        db,
        "insert into public.campaign_contacts (tenant_id, campaign_id, contact_id, enrollment_status) values ($1, $2, $3, 'enrolling')",
        [T.brs, SEED.brsActiveCampaign, SEED.brsCustomerContact],
      );
      expect(res.error).toContain("suppressed");
    });
  });

  it("blocks enrolling into an unapproved campaign", async () => {
    await asService(async (db) => {
      const res = await attempt(
        db,
        "insert into public.campaign_contacts (tenant_id, campaign_id, contact_id, enrollment_status) values ($1, $2, $3, 'enrolling')",
        [T.brs, SEED.brsNonCompliantDraft, SEED.brsUnenrolledContact],
      );
      expect(res.error).toContain("cannot enroll into a campaign in status draft");
    });
  });

  it("allows enrolling an unsuppressed contact into an active campaign", async () => {
    await asService(async (db) => {
      const res = await attempt(
        db,
        "insert into public.campaign_contacts (tenant_id, campaign_id, contact_id, enrollment_status) values ($1, $2, $3, 'enrolling')",
        [T.brs, SEED.brsActiveCampaign, SEED.brsUnenrolledContact],
      );
      expect(res.error).toBeUndefined();
    });
  });

  it("keeps the audit log append only, including for the service role", async () => {
    await asService(async (db) => {
      expect((await attempt(db, "update public.audit_logs set action = 'tampered'")).error).toContain("append only");
      expect((await attempt(db, "delete from public.audit_logs")).error).toContain("append only");
    });
  });

  it("still lets a tenant be deleted (audit rows cascade with it)", async () => {
    await asService(async (db) => {
      const res = await attempt(db, "delete from public.tenants where id = $1", [T.harbor]);
      expect(res).toEqual({ rowCount: 1 });
    });
  });
});
