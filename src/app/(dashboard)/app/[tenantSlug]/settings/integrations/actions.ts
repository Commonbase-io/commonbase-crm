"use server";

import { revalidatePath } from "next/cache";
import { assertCan, ForbiddenError } from "@/server/auth/roles";
import { requireTenantContext } from "@/server/auth/tenant-context";
import { audit } from "@/server/audit";
import { runScheduledJobs } from "@/server/jobs/run";
import { log } from "@/server/log";

export interface SyncState {
  error?: string;
  message?: string;
}

/**
 * Queues and runs this tenant's sync jobs now. Scoped to the tenant resolved
 * from the user's membership, so nobody can trigger another tenant's jobs.
 * Also the recovery path for failed or dead jobs: it queues fresh ones.
 */
export async function syncNowAction(_prev: SyncState, formData: FormData): Promise<SyncState> {
  const ctx = await requireTenantContext(String(formData.get("tenantSlug") ?? ""));
  try {
    assertCan(ctx.role, "jobs.run");
  } catch (error) {
    if (error instanceof ForbiddenError) return { error: "You don't have permission to run syncs." };
    throw error;
  }
  try {
    const summary = await runScheduledJobs({ tenantId: ctx.tenantId, budgetMs: 20_000 });
    await audit(ctx, "jobs.run_now", summary);
    revalidatePath(`/app/${ctx.tenantSlug}/settings/integrations`);
    const parts = [`${summary.succeeded} succeeded`];
    if (summary.retried) parts.push(`${summary.retried} will retry`);
    if (summary.dead) parts.push(`${summary.dead} failed`);
    return { message: summary.claimed ? `Ran ${summary.claimed} job${summary.claimed === 1 ? "" : "s"}: ${parts.join(", ")}.` : "Nothing to run." };
  } catch (error) {
    log.error("sync now failed", { error });
    return { error: "The sync couldn't run. Try again in a minute." };
  }
}
