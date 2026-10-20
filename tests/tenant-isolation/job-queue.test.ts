import { describe, expect, it } from "vitest";
import { T, U, asService, asUser, attempt, type Db } from "../support/db";

const enqueue = async (db: Db, tenantId: string, type: string, dedupe: string | null = type) =>
  (await db.query("select public.enqueue_job($1, $2, '{}'::jsonb, $3) as id", [tenantId, type, dedupe])).rows[0]?.id as string | null;

const claim = async (db: Db, worker: string, limit = 10, tenantId: string | null = null) =>
  (await db.query("select id, tenant_id, status, attempts, locked_by from public.claim_jobs($1, $2, interval '10 minutes', $3)", [worker, limit, tenantId])).rows;

describe("job queue", () => {
  it("dedupes queued or running jobs per tenant, but not across tenants or after completion", async () => {
    await asService(async (db) => {
      const first = await enqueue(db, T.brs, "sync.opt_outs");
      expect(first).toBeTruthy();
      expect(await enqueue(db, T.brs, "sync.opt_outs")).toBeNull();
      expect(await enqueue(db, T.harbor, "sync.opt_outs")).toBeTruthy();
      await db.query("update public.jobs set status = 'succeeded' where id = $1", [first]);
      expect(await enqueue(db, T.brs, "sync.opt_outs")).toBeTruthy();
    });
  });

  it("claims due jobs once, marks them running, and respects the tenant filter", async () => {
    await asService(async (db) => {
      await enqueue(db, T.brs, "test.a");
      await enqueue(db, T.harbor, "test.b");
      await db.query("select public.enqueue_job($1, 'test.later', '{}'::jsonb, null, now() + interval '1 hour')", [T.brs]);

      const brsOnly = await claim(db, "w1", 10, T.brs);
      expect(brsOnly.map((j) => j.tenant_id)).toEqual([T.brs]); // "later" isn't due
      expect(brsOnly[0]).toMatchObject({ status: "running", attempts: 1, locked_by: "w1" });
      expect(await claim(db, "w2", 10, T.brs)).toEqual([]);
      expect((await claim(db, "w2")).map((j) => j.tenant_id)).toEqual([T.harbor]);
    });
  });

  it("never hands the same job to two concurrent workers", async () => {
    await asService(async (setup) => {
      for (let i = 0; i < 4; i++) await enqueue(setup, T.brs, `test.t${i}`, null);
      await setup.query("commit");
      try {
        // Worker B claims while worker A's transaction still holds its rows:
        // SKIP LOCKED must give B the other jobs (without it, B would block).
        const ids = await asService(async (a) => {
          const aRows = await claim(a, "wa", 2);
          const bRows = await asService(async (b) => {
            await b.query("set local lock_timeout = '3s'"); // fail fast, not hang, if locking regresses
            return claim(b, "wb", 2);
          });
          return [...aRows, ...bRows].map((j) => j.id);
        });
        expect(ids.length).toBe(4);
        expect(new Set(ids).size).toBe(4);
      } finally {
        await setup.query("begin");
        await setup.query("delete from public.jobs where type like 'test.t_'");
        await setup.query("commit");
        await setup.query("begin");
      }
    });
  });

  it("recovers jobs whose worker died (stale lock)", async () => {
    await asService(async (db) => {
      const id = await enqueue(db, T.brs, "test.stuck");
      await db.query("update public.jobs set status = 'running', locked_at = now() - interval '1 hour', locked_by = 'dead-worker', attempts = 1 where id = $1", [id]);
      const fresh = await enqueue(db, T.brs, "test.fresh_running");
      await db.query("update public.jobs set status = 'running', locked_at = now(), locked_by = 'alive' where id = $1", [fresh]);
      const claimed = await claim(db, "w-new", 10, T.brs);
      expect(claimed.map((j) => j.id)).toEqual([id]);
      expect(claimed[0]).toMatchObject({ attempts: 2, locked_by: "w-new" });
    });
  });

  it("is server only: members can't enqueue, claim, or write jobs", async () => {
    await asUser(U.brsAdmin, async (db) => {
      expect((await attempt(db, "select public.enqueue_job($1, 'x')", [T.brs])).code).toBe("42501");
      expect((await attempt(db, "select * from public.claim_jobs('w')")).code).toBe("42501");
      expect((await attempt(db, "insert into public.jobs (tenant_id, type) values ($1, 'x')", [T.brs])).code).toBe("42501");
    });
  });

  it("managers see only their own tenant's jobs", async () => {
    await asService(async (db) => {
      await enqueue(db, T.harbor, "test.harbor_only");
      await db.query("commit");
    });
    try {
      await asUser(U.brsManager, async (db) => {
        expect((await db.query("select 1 from public.jobs where type = 'test.harbor_only'")).rowCount).toBe(0);
      });
      await asUser(U.harborAdmin, async (db) => {
        expect((await db.query("select 1 from public.jobs where type = 'test.harbor_only'")).rowCount).toBe(1);
      });
    } finally {
      await asService(async (db) => {
        await db.query("delete from public.jobs where type = 'test.harbor_only'");
        await db.query("commit");
      });
    }
  });
});
