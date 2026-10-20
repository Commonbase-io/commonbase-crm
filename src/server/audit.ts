import "server-only";
import type { Json } from "@/lib/database.types";
import type { TenantContext } from "@/server/auth/tenant-context";
import { redact } from "@/server/compliance/redact";
import { log } from "@/server/log";
import { createAdminClient } from "@/server/supabase/admin";

/**
 * Appends to audit_logs (service role only; members cannot write it).
 * Metadata is redacted: pass ids and counts, never emails or names.
 * A failed audit write is logged but does not undo the action it describes.
 */
export async function audit(ctx: TenantContext, action: string, metadata: Record<string, unknown> = {}) {
  const { error } = await createAdminClient()
    .from("audit_logs")
    .insert({ tenant_id: ctx.tenantId, actor_id: ctx.userId, action, metadata: redact(metadata) as { [key: string]: Json } });
  if (error) log.error("audit write failed", { action, code: error.code });
}
