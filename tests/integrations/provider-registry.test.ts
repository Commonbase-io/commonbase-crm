import { describe, expect, it } from "vitest";
import { createCredentialResolver, ProviderCredential, type CredentialResolver } from "@/server/providers/credentials";
import { ProviderUnavailableError } from "@/server/providers/errors";
import { createProviderRegistry, type ConnectionRecord, type ConnectionStore } from "@/server/providers/registry";

const TENANT_A = "a0000000-0000-4000-8000-000000000001";
const TENANT_B = "b0000000-0000-4000-8000-000000000001";
const CONN_A = "a0000000-0000-4000-8000-0000000000c1";
const CONN_B = "b0000000-0000-4000-8000-0000000000c1";

const connA: ConnectionRecord = {
  id: CONN_A, tenantId: TENANT_A, provider: "apollo", mode: "mock", status: "connected",
  credentialRef: `mock:${CONN_A}`, authorizationConfirmedAt: null,
};
const connB: ConnectionRecord = { ...connA, id: CONN_B, tenantId: TENANT_B, credentialRef: `mock:${CONN_B}` };

/** A store that filters correctly, like the real one. */
const storeOf = (...rows: ConnectionRecord[]): ConnectionStore => ({
  findActiveConnection: async (tenantId) => rows.find((r) => r.tenantId === tenantId && (r.status === "connected" || r.status === "pending")) ?? null,
});

const registry = (connections: ConnectionStore, overrides: { credentials?: CredentialResolver; liveGate?: () => "approved" | "locked" } = {}) =>
  createProviderRegistry({
    connections,
    credentials: overrides.credentials ?? createCredentialResolver(),
    liveGate: overrides.liveGate ?? (() => "locked"),
  });

async function reasonOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ProviderUnavailableError) return error.reason;
    throw error;
  }
  return "no error";
}

describe("provider registry: credential isolation", () => {
  it("builds each tenant's adapter from that tenant's own connection", async () => {
    const r = registry(storeOf(connA, connB));
    const a = await r.forTenant({ tenantId: TENANT_A });
    const b = await r.forTenant({ tenantId: TENANT_B });
    expect([a.tenantId, a.connectionId]).toEqual([TENANT_A, CONN_A]);
    expect([b.tenantId, b.connectionId]).toEqual([TENANT_B, CONN_B]);
    expect(a.mode).toBe("mock");
  });

  it("refuses to build tenant A's adapter from tenant B's connection even if the store returns it", async () => {
    const buggyStore: ConnectionStore = { findActiveConnection: async () => connB };
    expect(await reasonOf(registry(buggyStore).forTenant({ tenantId: TENANT_A }))).toBe("tenant_mismatch");
  });

  it("refuses a tenant A connection whose credential_ref points at tenant B's connection", async () => {
    const tampered = { ...connA, credentialRef: `mock:${CONN_B}` };
    expect(await reasonOf(registry(storeOf(tampered)).forTenant({ tenantId: TENANT_A }))).toBe("credential_mismatch");
  });

  it("refuses a vault ref bound to another tenant", async () => {
    const tampered: ConnectionRecord = { ...connA, mode: "live", authorizationConfirmedAt: "2026-01-01", credentialRef: `vault:tenant/${TENANT_B}/connection/${CONN_A}` };
    const r = registry(storeOf(tampered), {
      liveGate: () => "approved",
      credentials: createCredentialResolver({ readVaultSecret: async () => "should-never-be-read" }),
    });
    expect(await reasonOf(r.forTenant({ tenantId: TENANT_A }))).toBe("credential_mismatch");
  });

  it("refuses a resolver that returns a credential for a different connection", async () => {
    const lyingResolver: CredentialResolver = { resolve: async () => new ProviderCredential(TENANT_B, CONN_B, "mock", "x") };
    expect(await reasonOf(registry(storeOf(connA), { credentials: lyingResolver }).forTenant({ tenantId: TENANT_A }))).toBe(
      "credential_mismatch",
    );
  });

  it("an adapter never accepts another tenant's sequence ids", async () => {
    const r = registry(storeOf(connA, connB));
    const a = await r.forTenant({ tenantId: TENANT_A });
    const b = await r.forTenant({ tenantId: TENANT_B });
    const seqB = await b.outreach.createSequence({ name: "x", mailboxExternalId: "m", steps: [], idempotencyKey: "k-123456" });
    await expect(a.outreach.activateSequence(seqB)).rejects.toThrow(/Unknown sequence/);
    await expect(
      a.outreach.enrollContacts({ sequenceExternalId: seqB, mailboxExternalId: "m", contacts: [], idempotencyKey: "k-123456" }),
    ).rejects.toThrow(/Unknown sequence/);
  });

  it("has no shared state between calls: a revoked connection stops working on the next request", async () => {
    const rows = [connA];
    const r = registry(storeOf(...rows));
    await r.forTenant({ tenantId: TENANT_A });
    rows[0] = { ...connA, status: "revoked", credentialRef: null };
    const after = registry(storeOf(...rows));
    expect(await reasonOf(after.forTenant({ tenantId: TENANT_A }))).toBe("no_connection");
  });

  it("rejects missing, disconnected, and errored connections", async () => {
    expect(await reasonOf(registry(storeOf()).forTenant({ tenantId: TENANT_A }))).toBe("no_connection");
    expect(await reasonOf(registry(storeOf({ ...connA, status: "pending" })).forTenant({ tenantId: TENANT_A }))).toBe("not_connected");
    expect(await reasonOf(registry(storeOf({ ...connA, credentialRef: null })).forTenant({ tenantId: TENANT_A }))).toBe("missing_credential");
  });

  it("never prints or serializes a credential", () => {
    const credential = new ProviderCredential(TENANT_A, CONN_A, "api_key", "super-secret-value");
    expect(JSON.stringify({ credential })).not.toContain("super-secret-value");
    expect(String(credential)).not.toContain("super-secret-value");
    expect(credential.reveal()).toBe("super-secret-value");
  });
});

describe("provider registry: live gate", () => {
  const live: ConnectionRecord = { ...connA, mode: "live", credentialRef: `vault:tenant/${TENANT_A}/connection/${CONN_A}`, authorizationConfirmedAt: "2026-10-01" };

  it("blocks live mode while the gate is locked", async () => {
    expect(await reasonOf(registry(storeOf(live)).forTenant({ tenantId: TENANT_A }))).toBe("live_blocked");
  });

  it("blocks live mode without a recorded written authorization, even if the gate is open", async () => {
    const r = registry(storeOf({ ...live, authorizationConfirmedAt: null }), { liveGate: () => "approved" });
    expect(await reasonOf(r.forTenant({ tenantId: TENANT_A }))).toBe("live_blocked");
  });

  it("still blocks because the live adapter is not implemented", async () => {
    const r = registry(storeOf(live), {
      liveGate: () => "approved",
      credentials: createCredentialResolver({ readVaultSecret: async () => "k" }),
    });
    expect(await reasonOf(r.forTenant({ tenantId: TENANT_A }))).toBe("live_blocked");
  });
});
