import "server-only";
import type { Json } from "@/lib/database.types";
import { createAdminClient } from "@/server/supabase/admin";
import type { IdempotencyRecord, IdempotencyStore } from "./idempotency";

const UNIQUE_VIOLATION = "23505";

/** idempotency_keys rows for one tenant. Service role: members have no access to this table. */
export function supabaseIdempotencyStore(tenantId: string): IdempotencyStore {
  const db = createAdminClient();
  return {
    async claim(key, operation, requestHash) {
      const { error } = await db.from("idempotency_keys").insert({ tenant_id: tenantId, key, operation, request_hash: requestHash });
      if (!error) return "claimed";
      if (error.code !== UNIQUE_VIOLATION) throw new Error("Failed to claim idempotency key");
      const { data, error: readError } = await db
        .from("idempotency_keys")
        .select("status, request_hash, response")
        .eq("tenant_id", tenantId)
        .eq("key", key)
        .single();
      if (readError) throw new Error("Failed to read idempotency key");
      return { status: data.status as IdempotencyRecord["status"], requestHash: data.request_hash, response: data.response };
    },
    async reclaim(key, requestHash) {
      const { data, error } = await db
        .from("idempotency_keys")
        .update({ status: "in_progress", request_hash: requestHash, response: null })
        .eq("tenant_id", tenantId)
        .eq("key", key)
        .eq("status", "failed")
        .select("key");
      if (error) throw new Error("Failed to reclaim idempotency key");
      return data.length === 1;
    },
    async complete(key, response) {
      const { error } = await db
        .from("idempotency_keys")
        .update({ status: "completed", response: response as Json })
        .eq("tenant_id", tenantId)
        .eq("key", key);
      if (error) throw new Error("Failed to complete idempotency key");
    },
    async fail(key, response) {
      await db.from("idempotency_keys").update({ status: "failed", response: response as Json }).eq("tenant_id", tenantId).eq("key", key);
    },
  };
}
