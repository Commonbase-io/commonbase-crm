import "server-only";
import type { ProviderAdapters } from "@/server/providers/interfaces";
import { redactString } from "@/server/compliance/redact";
import { log } from "@/server/log";
import { createAdminClient } from "@/server/supabase/admin";
import { normalizeEmail, suppressionHash } from "./suppression";

// Pulls opt-outs from the tenant's provider into suppression_entries. Required
// before every enrollment and activation, and on a schedule (job runner).
// Failure is recorded on sync_jobs (visible on the Integrations page) and
// rethrown, so callers stop rather than enroll without fresh opt-outs.

const FIRST_SYNC_LOOKBACK_DAYS = 90;

export async function syncOptOuts(tenantId: string, adapters: ProviderAdapters): Promise<{ added: number }> {
  if (adapters.tenantId !== tenantId) throw new Error("Adapter does not belong to this tenant");
  const db = createAdminClient();
  const startedAt = new Date();

  const { data: state, error: stateError } = await db
    .from("sync_jobs")
    .upsert(
      { tenant_id: tenantId, provider_connection_id: adapters.connectionId, kind: "opt_outs", status: "running" },
      { onConflict: "tenant_id,provider_connection_id,kind" },
    )
    .select("id, last_success_at")
    .single();
  if (stateError) throw new Error("Failed to start opt-out sync");

  try {
    const since = state.last_success_at
      ? new Date(state.last_success_at)
      : new Date(startedAt.getTime() - FIRST_SYNC_LOOKBACK_DAYS * 86_400_000);
    const optOuts = await adapters.outreach.getOptOuts(since);

    let added = 0;
    if (optOuts.length) {
      const rows = [...new Set(optOuts.map((o) => normalizeEmail(o.email)))].map((email) => ({
        tenant_id: tenantId,
        scope: "email",
        value_hash: suppressionHash(email),
        reason: "Unsubscribed via provider",
        source: "provider_opt_out",
      }));
      const { data, error } = await db
        .from("suppression_entries")
        .upsert(rows, { onConflict: "tenant_id,scope,value_hash", ignoreDuplicates: true })
        .select("id");
      if (error) throw new Error("Failed to write suppressions");
      added = data.length;
    }

    await db
      .from("sync_jobs")
      .update({ status: "succeeded", last_success_at: startedAt.toISOString(), last_error: null })
      .eq("tenant_id", tenantId)
      .eq("id", state.id);
    return { added };
  } catch (error) {
    const message = redactString(error instanceof Error ? error.message : "Unknown error").slice(0, 500);
    await db.from("sync_jobs").update({ status: "failed", last_error: message }).eq("tenant_id", tenantId).eq("id", state.id);
    log.error("opt-out sync failed", { tenantId, error });
    throw error;
  }
}
