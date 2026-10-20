import "server-only";
import { withSyncState } from "@/server/jobs/sync-state";
import type { ProviderAdapters } from "@/server/providers/interfaces";
import { createAdminClient } from "@/server/supabase/admin";
import { normalizeEmail, suppressionHash } from "./suppression";

// Pulls opt-outs from the tenant's provider into suppression_entries. Required
// before every enrollment and activation, and on a schedule (job runner).
// A failure is recorded on sync_jobs (visible on the Integrations page) and
// rethrown, so callers stop rather than enroll without fresh opt-outs.

const FIRST_SYNC_LOOKBACK_DAYS = 90;

export async function syncOptOuts(tenantId: string, adapters: ProviderAdapters): Promise<{ added: number }> {
  if (adapters.tenantId !== tenantId) throw new Error("Adapter does not belong to this tenant");
  return withSyncState({ tenantId, connectionId: adapters.connectionId, kind: "opt_outs" }, async (lastSuccess) => {
    const since = lastSuccess ?? new Date(Date.now() - FIRST_SYNC_LOOKBACK_DAYS * 86_400_000);
    const optOuts = await adapters.outreach.getOptOuts(since);
    return { added: await addEmailSuppressions(tenantId, optOuts.map((o) => o.email), "provider_opt_out", "Unsubscribed via provider") };
  });
}

/** Adds email suppressions (hashed), ignoring ones already present. Returns how many were new. */
export async function addEmailSuppressions(
  tenantId: string,
  emails: string[],
  source: "provider_opt_out" | "bounce" | "complaint",
  reason: string,
): Promise<number> {
  const unique = [...new Set(emails.map(normalizeEmail))];
  if (!unique.length) return 0;
  const { data, error } = await createAdminClient()
    .from("suppression_entries")
    .upsert(
      unique.map((email) => ({ tenant_id: tenantId, scope: "email", value_hash: suppressionHash(email), reason, source })),
      { onConflict: "tenant_id,scope,value_hash", ignoreDuplicates: true },
    )
    .select("id");
  if (error) throw new Error("Failed to write suppressions");
  return data.length;
}
