import type { ProviderAdapters } from "../interfaces";
import type { ProviderCredential } from "../credentials";
import { ProviderUnavailableError } from "../errors";

// Live Apollo adapter: DO NOT IMPLEMENT until every gate in
// docs/apollo-integration-gates.md is satisfied, including written confirmation
// from Apollo that agency-provisioned per-client accounts are permitted.
//
// Endpoints, auth method, scopes, rate limits, and retention rules are all
// unverified. Do not fill this in from memory; check current official docs.

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature fixed for the registry; body intentionally blocked
export function createApolloAdapters(_input: { tenantId: string; connectionId: string; credential: ProviderCredential }): ProviderAdapters {
  throw new ProviderUnavailableError("live_blocked", "Live Apollo adapter is not implemented (blocked pending written approval)");
}
