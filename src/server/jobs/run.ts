import "server-only";
import { randomUUID } from "node:crypto";
import { redactString } from "@/server/compliance/redact";
import { JOB_HANDLERS, enqueueRecurringJobs } from "./handlers";
import { runJobs } from "./runner";
import { supabaseJobStore } from "./store";

/** Queue recurring jobs, then work through due jobs within a time budget. */
export async function runScheduledJobs(options: { tenantId?: string; budgetMs?: number } = {}) {
  const queued = await enqueueRecurringJobs(options.tenantId);
  const summary = await runJobs({
    store: supabaseJobStore(),
    handlers: JOB_HANDLERS,
    workerId: `worker-${randomUUID()}`,
    tenantId: options.tenantId,
    budgetMs: options.budgetMs,
    describeError: (e) => redactString(e instanceof Error ? e.message : "Unknown error"),
  });
  return { queued, ...summary };
}
