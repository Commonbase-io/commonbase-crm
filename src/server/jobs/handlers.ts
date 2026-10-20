import "server-only";
import { reconcileEnrollments } from "@/server/campaigns/campaigns";
import { syncOptOuts } from "@/server/compliance/opt-out-sync";
import { syncEmailActivity } from "@/server/crm/activity-sync";
import { getProviderRegistry } from "@/server/providers/server-registry";
import { createAdminClient } from "@/server/supabase/admin";
import type { JobHandler } from "./runner";

export const JOB_TYPES = {
  optOuts: "sync.opt_outs",
  emailActivity: "sync.email_activity",
  reconcileEnrollments: "campaigns.reconcile_enrollments",
} as const;

/** Rows left `enrolling` longer than this are assumed abandoned and re-sent. */
const STALE_ENROLLMENT_MS = 10 * 60_000;

// Every handler builds its adapter from the job's own tenant through the
// registry, exactly like a user request, so a job can only ever touch its
// tenant's connection and credential.
const adaptersFor = (tenantId: string) => getProviderRegistry().forTenant({ tenantId });

export const JOB_HANDLERS: Readonly<Record<string, JobHandler>> = {
  [JOB_TYPES.optOuts]: async (job) => syncOptOuts(job.tenantId, await adaptersFor(job.tenantId)),

  [JOB_TYPES.emailActivity]: async (job) => syncEmailActivity(job.tenantId, await adaptersFor(job.tenantId)),

  [JOB_TYPES.reconcileEnrollments]: async (job) => {
    const staleBefore = new Date(Date.now() - STALE_ENROLLMENT_MS);
    const { data, error } = await createAdminClient()
      .from("campaign_contacts")
      .select("campaign_id")
      .eq("tenant_id", job.tenantId)
      .eq("enrollment_status", "enrolling")
      .lt("updated_at", staleBefore.toISOString());
    if (error) throw new Error("Failed to find pending enrollments");
    const campaignIds = [...new Set(data.map((r) => r.campaign_id))];
    for (const campaignId of campaignIds) {
      // System actor; never reactivates a failed campaign (a person decides that).
      await reconcileEnrollments({ tenantId: job.tenantId, userId: null }, campaignId, { recoverFailedCampaign: false, staleBefore });
    }
    return { campaigns: campaignIds.length };
  },
};

const RECURRING = [JOB_TYPES.optOuts, JOB_TYPES.emailActivity, JOB_TYPES.reconcileEnrollments] as const;

/**
 * Queues the recurring jobs for one tenant, or for every tenant with a
 * connected provider. The dedupe key keeps at most one of each queued or
 * running per tenant, so repeated calls never stack work.
 */
export async function enqueueRecurringJobs(tenantId?: string): Promise<number> {
  const db = createAdminClient();
  let query = db.from("provider_connections").select("tenant_id").eq("status", "connected");
  if (tenantId) query = query.eq("tenant_id", tenantId);
  const { data, error } = await query;
  if (error) throw new Error("Failed to list connected tenants");
  let queued = 0;
  for (const tenant of new Set(data.map((c) => c.tenant_id))) {
    for (const type of RECURRING) {
      const { data: id, error: enqueueError } = await db.rpc("enqueue_job", { p_tenant_id: tenant, p_type: type, p_dedupe_key: type });
      if (enqueueError) throw new Error("Failed to enqueue job");
      if (id) queued++;
    }
  }
  return queued;
}
