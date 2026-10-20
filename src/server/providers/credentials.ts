import { ProviderUnavailableError } from "./errors";

// Credentials are referenced by `credential_ref` and resolved server-side at
// call time. A ref is *bound* to one tenant connection: the resolver refuses a
// ref that names a different tenant or connection than the one being built,
// so a corrupted or copied ref cannot hand Tenant A's request Tenant B's key.
//
// Ref formats:
//   mock:<connection_id>                                        mock adapter, no secret
//   vault:tenant/<tenant_id>/connection/<connection_id>         Phase B (Supabase Vault), not yet implemented

export interface CredentialBinding {
  tenantId: string;
  connectionId: string;
  credentialRef: string;
}

const inspect = Symbol.for("nodejs.util.inspect.custom");

/** Opaque secret holder. Never serializes or prints its value. */
export class ProviderCredential {
  readonly #secret: string;

  constructor(
    readonly tenantId: string,
    readonly connectionId: string,
    readonly kind: "mock" | "api_key" | "oauth",
    secret: string,
  ) {
    this.#secret = secret;
  }

  reveal(): string {
    return this.#secret;
  }

  toJSON() {
    return { tenantId: this.tenantId, connectionId: this.connectionId, kind: this.kind, secret: "[redacted]" };
  }

  toString() {
    return "[ProviderCredential redacted]";
  }

  [inspect]() {
    return this.toString();
  }
}

type ParsedRef = { scheme: "mock"; connectionId: string } | { scheme: "vault"; tenantId: string; connectionId: string };

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const MOCK_REF = new RegExp(`^mock:(${UUID})$`);
const VAULT_REF = new RegExp(`^vault:tenant/(${UUID})/connection/(${UUID})$`);

export function parseCredentialRef(ref: string): ParsedRef | null {
  const mock = MOCK_REF.exec(ref);
  if (mock?.[1]) return { scheme: "mock", connectionId: mock[1] };
  const vault = VAULT_REF.exec(ref);
  if (vault?.[1] && vault[2]) return { scheme: "vault", tenantId: vault[1], connectionId: vault[2] };
  return null;
}

export interface CredentialResolver {
  resolve(binding: CredentialBinding): Promise<ProviderCredential>;
}

export interface CredentialResolverDeps {
  /** Phase B: read a secret from Supabase Vault by name. Absent until live access is approved. */
  readVaultSecret?: (name: string) => Promise<string | null>;
}

export function createCredentialResolver(deps: CredentialResolverDeps = {}): CredentialResolver {
  return {
    async resolve({ tenantId, connectionId, credentialRef }) {
      const parsed = parseCredentialRef(credentialRef);
      if (!parsed) {
        throw new ProviderUnavailableError("credential_mismatch", "Credential reference is malformed");
      }
      if (parsed.connectionId !== connectionId || (parsed.scheme === "vault" && parsed.tenantId !== tenantId)) {
        throw new ProviderUnavailableError("credential_mismatch", "Credential reference is not bound to this tenant connection");
      }
      if (parsed.scheme === "mock") {
        return new ProviderCredential(tenantId, connectionId, "mock", `mock-secret-${connectionId}`);
      }
      if (!deps.readVaultSecret) {
        throw new ProviderUnavailableError("live_blocked", "Live credential resolution is not enabled");
      }
      const secret = await deps.readVaultSecret(credentialRef.slice("vault:".length));
      if (!secret) throw new ProviderUnavailableError("missing_credential", "Credential not found");
      return new ProviderCredential(tenantId, connectionId, "api_key", secret);
    },
  };
}
