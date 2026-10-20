import type { ProviderAdapters } from "./interfaces";
import { createApolloAdapters } from "./apollo";
import type { CredentialResolver } from "./credentials";
import { ProviderUnavailableError } from "./errors";
import { createMockApolloAdapters } from "./mock-apollo";

// Builds provider adapters for one tenant, per request, from that tenant's own
// connection record. There is deliberately no module-level client or cache:
// every call resolves the connection and credential again for the tenant that
// the caller already authorized (requireTenantContext).

export type ConnectionStatus = "disconnected" | "pending" | "connected" | "error" | "revoked";

export interface ConnectionRecord {
  id: string;
  tenantId: string;
  provider: "apollo";
  mode: "mock" | "live";
  status: ConnectionStatus;
  credentialRef: string | null;
  authorizationConfirmedAt: string | null;
}

export interface ConnectionStore {
  /** The tenant's pending/connected connection for the provider, if any. Must filter by tenantId. */
  findActiveConnection(tenantId: string, provider: "apollo"): Promise<ConnectionRecord | null>;
}

export interface ProviderRegistryDeps {
  connections: ConnectionStore;
  credentials: CredentialResolver;
  liveGate: () => "approved" | "locked";
}

export interface ProviderRegistry {
  forTenant(tenant: { tenantId: string }): Promise<ProviderAdapters>;
}

export function createProviderRegistry(deps: ProviderRegistryDeps): ProviderRegistry {
  return {
    async forTenant({ tenantId }) {
      const connection = await deps.connections.findActiveConnection(tenantId, "apollo");
      if (!connection) {
        throw new ProviderUnavailableError("no_connection", "Tenant has no Apollo connection");
      }
      // Defense in depth: never trust the store to have filtered correctly.
      if (connection.tenantId !== tenantId) {
        throw new ProviderUnavailableError("tenant_mismatch", "Connection does not belong to the requesting tenant");
      }
      if (connection.provider !== "apollo") {
        throw new ProviderUnavailableError("unsupported_provider", "Unsupported provider");
      }
      if (connection.status !== "connected") {
        throw new ProviderUnavailableError("not_connected", `Apollo connection is ${connection.status}`);
      }
      if (!connection.credentialRef) {
        throw new ProviderUnavailableError("missing_credential", "Connection has no credential");
      }

      if (connection.mode === "live") {
        if (deps.liveGate() !== "approved" || !connection.authorizationConfirmedAt) {
          throw new ProviderUnavailableError("live_blocked", "Live Apollo access is blocked pending written approval");
        }
      }

      const credential = await deps.credentials.resolve({
        tenantId,
        connectionId: connection.id,
        credentialRef: connection.credentialRef,
      });
      if (credential.tenantId !== tenantId || credential.connectionId !== connection.id) {
        throw new ProviderUnavailableError("credential_mismatch", "Resolved credential is bound to a different connection");
      }

      const input = { tenantId, connectionId: connection.id, credential };
      return connection.mode === "mock" ? createMockApolloAdapters(input) : createApolloAdapters(input);
    },
  };
}
