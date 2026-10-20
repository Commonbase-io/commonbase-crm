import "server-only";
import { apolloLiveGate } from "@/server/env";
import { createAdminClient } from "@/server/supabase/admin";
import { connectionModeSchema, connectionStatusSchema, providerSchema } from "./connection-row";
import { createCredentialResolver } from "./credentials";
import { createProviderRegistry, type ConnectionRecord, type ConnectionStore } from "./registry";

// Production wiring for the registry. Reads credential_ref with the service
// role (the authenticated role cannot read that column), always filtered by the
// tenant id that requireTenantContext resolved from the user's membership.

function supabaseConnectionStore(): ConnectionStore {
  return {
    async findActiveConnection(tenantId, provider) {
      const { data, error } = await createAdminClient()
        .from("provider_connections")
        .select("id, tenant_id, provider, mode, status, credential_ref, authorization_confirmed_at")
        .eq("tenant_id", tenantId)
        .eq("provider", provider)
        .in("status", ["pending", "connected"])
        .maybeSingle();
      if (error) throw new Error("Failed to load provider connection");
      if (!data) return null;
      const record: ConnectionRecord = {
        id: data.id,
        tenantId: data.tenant_id,
        provider: providerSchema.parse(data.provider),
        mode: connectionModeSchema.parse(data.mode),
        status: connectionStatusSchema.parse(data.status),
        credentialRef: data.credential_ref,
        authorizationConfirmedAt: data.authorization_confirmed_at,
      };
      return record;
    },
  };
}

/** Call once per request; do not store the result in module scope. */
export function getProviderRegistry() {
  return createProviderRegistry({
    connections: supabaseConnectionStore(),
    credentials: createCredentialResolver(),
    liveGate: apolloLiveGate,
  });
}
