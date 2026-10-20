import "server-only";
import { redactString } from "@/server/compliance/redact";
import { log } from "@/server/log";
import { createAdminClient } from "@/server/supabase/admin";

export type SyncKind = "opt_outs" | "email_activity" | "mailboxes";

/**
 * Runs one provider sync and records it on sync_jobs: running, then
 * succeeded (with last_success_at = start time, the next sync's cursor) or
 * failed (redacted error, shown on the Integrations page). Errors are
 * rethrown so callers (enrollment, the job runner) can stop or retry.
 */
export async function withSyncState<T>(
  input: { tenantId: string; connectionId: string; kind: SyncKind },
  work: (since: Date | null) => Promise<T>,
): Promise<T> {
  const db = createAdminClient();
  const startedAt = new Date();
  const { data: state, error } = await db
    .from("sync_jobs")
    .upsert(
      { tenant_id: input.tenantId, provider_connection_id: input.connectionId, kind: input.kind, status: "running" },
      { onConflict: "tenant_id,provider_connection_id,kind" },
    )
    .select("id, last_success_at")
    .single();
  if (error) throw new Error(`Failed to start ${input.kind} sync`);

  try {
    const result = await work(state.last_success_at ? new Date(state.last_success_at) : null);
    await db
      .from("sync_jobs")
      .update({ status: "succeeded", last_success_at: startedAt.toISOString(), last_error: null })
      .eq("tenant_id", input.tenantId)
      .eq("id", state.id);
    return result;
  } catch (err) {
    const message = redactString(err instanceof Error ? err.message : "Unknown error").slice(0, 500);
    await db.from("sync_jobs").update({ status: "failed", last_error: message }).eq("tenant_id", input.tenantId).eq("id", state.id);
    log.error("provider sync failed", { kind: input.kind, error: err });
    throw err;
  }
}
