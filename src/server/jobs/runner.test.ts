import { describe, expect, it } from "vitest";
import { backoffMs, runJobs, type ClaimedJob, type JobStore } from "./runner";

function memoryStore(initial: ClaimedJob[]) {
  const queue = [...initial];
  const log: string[] = [];
  const store: JobStore = {
    async claim({ limit, tenantId }) {
      const picked: ClaimedJob[] = [];
      for (let i = 0; i < queue.length && picked.length < limit; ) {
        const job = queue[i]!;
        if (!tenantId || job.tenantId === tenantId) {
          picked.push({ ...job, attempts: job.attempts + 1 });
          queue.splice(i, 1);
        } else i++;
      }
      return picked;
    },
    async succeed(job) { log.push(`ok:${job.id}`); },
    async retry(job, error) { log.push(`retry:${job.id}:${error}`); },
    async bury(job, error) { log.push(`dead:${job.id}:${error}`); },
  };
  return { store, log, queue };
}

const job = (id: string, type: string, over: Partial<ClaimedJob> = {}): ClaimedJob => ({ id, tenantId: "t1", type, payload: {}, attempts: 0, maxAttempts: 3, ...over });

describe("runJobs", () => {
  it("runs handlers and records outcomes", async () => {
    const { store, log } = memoryStore([job("1", "ok"), job("2", "boom"), job("3", "nope")]);
    const summary = await runJobs({
      store,
      workerId: "w",
      handlers: { ok: async () => undefined, boom: async () => { throw new Error("provider timeout"); } },
    });
    expect(summary).toEqual({ claimed: 3, succeeded: 1, retried: 1, dead: 1 });
    expect(log).toEqual(["ok:1", "retry:2:provider timeout", "dead:3:Unknown job type: nope"]);
  });

  it("buries a job on its last attempt instead of retrying", async () => {
    const { store, log } = memoryStore([job("1", "boom", { attempts: 2, maxAttempts: 3 })]);
    await runJobs({ store, workerId: "w", handlers: { boom: async () => { throw new Error("still failing"); } } });
    expect(log).toEqual(["dead:1:still failing"]);
  });

  it("only runs the requested tenant's jobs when scoped", async () => {
    const { store, log, queue } = memoryStore([job("a", "ok", { tenantId: "t1" }), job("b", "ok", { tenantId: "t2" })]);
    const seen: string[] = [];
    await runJobs({ store, workerId: "w", tenantId: "t1", handlers: { ok: async (j) => { seen.push(j.tenantId); } } });
    expect(seen).toEqual(["t1"]);
    expect(log).toEqual(["ok:a"]);
    expect(queue.map((j) => j.id)).toEqual(["b"]);
  });

  it("refuses a job from another tenant even if the store returns one", async () => {
    const store: JobStore = {
      claim: async () => [job("x", "ok", { tenantId: "t2", attempts: 1 })],
      succeed: async () => undefined,
      retry: async () => undefined,
      bury: async () => undefined,
    };
    let ran = false;
    let calls = 0;
    const wrapped: JobStore = { ...store, claim: async (i) => (calls++ ? [] : store.claim(i)) };
    const summary = await runJobs({ store: wrapped, workerId: "w", tenantId: "t1", handlers: { ok: async () => { ran = true; } } });
    expect(ran).toBe(false);
    expect(summary.dead).toBe(1);
  });

  it("stops claiming when the time budget is spent", async () => {
    let t = 0;
    const { store } = memoryStore(Array.from({ length: 30 }, (_, i) => job(String(i), "slow")));
    const summary = await runJobs({
      store, workerId: "w", batchSize: 10, budgetMs: 15, now: () => t,
      handlers: { slow: async () => { t += 1; } },
    });
    expect(summary.claimed).toBe(20);
  });

  it("backs off exponentially, capped at an hour", () => {
    expect(backoffMs(1)).toBe(60_000);
    expect(backoffMs(3)).toBe(4 * 60_000);
    expect(backoffMs(20)).toBe(60 * 60_000);
  });
});
