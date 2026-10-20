// Job runner core, independent of the database so it can be unit tested.
// Each claimed job runs its handler with only its own tenant id; handlers
// never receive another tenant's data or credentials.

export interface ClaimedJob {
  id: string;
  tenantId: string;
  type: string;
  payload: unknown;
  attempts: number;
  maxAttempts: number;
}

export type JobHandler = (job: ClaimedJob) => Promise<unknown>;

export interface JobStore {
  claim(input: { workerId: string; limit: number; tenantId?: string }): Promise<ClaimedJob[]>;
  succeed(job: ClaimedJob): Promise<void>;
  /** Re-queue for another attempt at `runAfter`. */
  retry(job: ClaimedJob, error: string, runAfter: Date): Promise<void>;
  /** Give up: attempts exhausted or unknown type. */
  bury(job: ClaimedJob, error: string): Promise<void>;
}

export interface RunSummary {
  claimed: number;
  succeeded: number;
  retried: number;
  dead: number;
}

/** Exponential backoff in minutes: 1, 2, 4, 8 ... capped at 60. */
export function backoffMs(attempts: number): number {
  return Math.min(60, 2 ** Math.max(0, attempts - 1)) * 60_000;
}

export async function runJobs(input: {
  store: JobStore;
  handlers: Readonly<Record<string, JobHandler>>;
  workerId: string;
  /** Restrict to one tenant (a user's "run now"). */
  tenantId?: string;
  batchSize?: number;
  /** Stop claiming new batches after this long. */
  budgetMs?: number;
  now?: () => number;
  describeError?: (error: unknown) => string;
}): Promise<RunSummary> {
  const now = input.now ?? Date.now;
  const describe = input.describeError ?? ((e: unknown) => (e instanceof Error ? e.message : "Unknown error"));
  const deadline = now() + (input.budgetMs ?? 25_000);
  const summary: RunSummary = { claimed: 0, succeeded: 0, retried: 0, dead: 0 };

  while (now() < deadline) {
    const jobs = await input.store.claim({ workerId: input.workerId, limit: input.batchSize ?? 10, tenantId: input.tenantId });
    if (!jobs.length) break;
    summary.claimed += jobs.length;

    for (const job of jobs) {
      // Defense in depth: a tenant-scoped run must never execute another tenant's job.
      if (input.tenantId && job.tenantId !== input.tenantId) {
        await input.store.bury(job, "Claimed outside the requested tenant");
        summary.dead++;
        continue;
      }
      const handler = input.handlers[job.type];
      if (!handler) {
        await input.store.bury(job, `Unknown job type: ${job.type}`);
        summary.dead++;
        continue;
      }
      if (job.attempts > job.maxAttempts) {
        await input.store.bury(job, "Attempts exhausted");
        summary.dead++;
        continue;
      }
      try {
        await handler(job);
        await input.store.succeed(job);
        summary.succeeded++;
      } catch (error) {
        const message = describe(error);
        if (job.attempts >= job.maxAttempts) {
          await input.store.bury(job, message);
          summary.dead++;
        } else {
          await input.store.retry(job, message, new Date(now() + backoffMs(job.attempts)));
          summary.retried++;
        }
      }
    }
  }
  return summary;
}
