import "server-only";
import { redactString } from "@/server/compliance/redact";
import { createAdminClient } from "@/server/supabase/admin";
import type { ClaimedJob, JobStore } from "./runner";

/** jobs table via the service role. Members can read jobs (managers+) but never write them. */
export function supabaseJobStore(): JobStore {
  const db = createAdminClient();
  const finish = async (job: ClaimedJob, update: { status: string; last_error?: string | null; run_after?: string }) => {
    const { error } = await db
      .from("jobs")
      .update({ ...update, locked_at: null, locked_by: null })
      .eq("tenant_id", job.tenantId)
      .eq("id", job.id);
    if (error) throw new Error("Failed to update job");
  };
  const clean = (message: string) => redactString(message).slice(0, 500);

  return {
    async claim({ workerId, limit, tenantId }) {
      const { data, error } = await db.rpc("claim_jobs", { p_worker: workerId, p_limit: limit, p_tenant_id: tenantId });
      if (error) throw new Error("Failed to claim jobs");
      return (data ?? []).map((j) => ({
        id: j.id,
        tenantId: j.tenant_id,
        type: j.type,
        payload: j.payload,
        attempts: j.attempts,
        maxAttempts: j.max_attempts,
      }));
    },
    succeed: (job) => finish(job, { status: "succeeded", last_error: null }),
    retry: (job, error, runAfter) => finish(job, { status: "queued", last_error: clean(error), run_after: runAfter.toISOString() }),
    bury: (job, error) => finish(job, { status: "dead", last_error: clean(error) }),
  };
}
