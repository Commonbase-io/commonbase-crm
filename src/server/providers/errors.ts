export type ProviderUnavailableReason =
  | "no_connection"
  | "not_connected"
  | "tenant_mismatch"
  | "missing_credential"
  | "credential_mismatch"
  | "live_blocked"
  | "unsupported_provider";

/** Thrown instead of ever returning an adapter the request is not entitled to. */
export class ProviderUnavailableError extends Error {
  constructor(
    public readonly reason: ProviderUnavailableReason,
    message: string,
  ) {
    super(message);
    this.name = "ProviderUnavailableError";
  }
}
