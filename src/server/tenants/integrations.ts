import "server-only";
import type { z } from "zod";
import type { TenantContext } from "@/server/auth/tenant-context";
import { assertCan } from "@/server/auth/roles";
import { connectionModeSchema, connectionStatusSchema, partySchema } from "@/server/providers/connection-row";
import { createUserClient } from "@/server/supabase/server";

export interface IntegrationView {
  provider: "apollo";
  status: z.infer<typeof connectionStatusSchema>;
  mode: z.infer<typeof connectionModeSchema>;
  accountHolder: z.infer<typeof partySchema> | null;
  billingParty: z.infer<typeof partySchema> | null;
  planTier: string | null;
  authorizationConfirmedAt: string | null;
  lastVerifiedAt: string | null;
  lastError: string | null;
  mailboxes: { email: string; status: string; dailyLimit: number }[];
  syncs: { kind: string; status: string; lastSuccessAt: string | null; lastError: string | null }[];
  jobs: { id: string; type: string; status: string; attempts: number; lastError: string | null; updatedAt: string }[];
}

/** Connection status for the integrations page. Never selects credential_ref. */
export async function loadApolloIntegration(ctx: TenantContext): Promise<IntegrationView> {
  assertCan(ctx.role, "integrations.view");
  const supabase = await createUserClient();
  const { data: connections, error } = await supabase
    .from("provider_connections")
    .select("id, status, mode, account_holder, billing_party, plan_tier, authorization_confirmed_at, last_verified_at, last_error, updated_at")
    .eq("tenant_id", ctx.tenantId)
    .eq("provider", "apollo")
    .order("updated_at", { ascending: false });
  if (error) throw new Error("Failed to load integration");

  const active = connections?.find((c) => c.status === "pending" || c.status === "connected") ?? connections?.[0];
  if (!active) {
    return {
      provider: "apollo", status: "disconnected", mode: "mock", accountHolder: null, billingParty: null, planTier: null,
      authorizationConfirmedAt: null, lastVerifiedAt: null, lastError: null, mailboxes: [], syncs: [], jobs: [],
    };
  }

  const [mailboxes, syncs, jobs] = await Promise.all([
    supabase.from("mailboxes").select("email, status, daily_limit").eq("tenant_id", ctx.tenantId).eq("provider_connection_id", active.id),
    supabase.from("sync_jobs").select("kind, status, last_success_at, last_error").eq("tenant_id", ctx.tenantId).eq("provider_connection_id", active.id),
    supabase
      .from("jobs")
      .select("id, type, status, attempts, last_error, updated_at")
      .eq("tenant_id", ctx.tenantId)
      .order("updated_at", { ascending: false })
      .limit(10),
  ]);
  if (mailboxes.error || syncs.error || jobs.error) throw new Error("Failed to load integration details");

  return {
    provider: "apollo",
    status: connectionStatusSchema.parse(active.status),
    mode: connectionModeSchema.parse(active.mode),
    accountHolder: partySchema.parse(active.account_holder),
    billingParty: partySchema.parse(active.billing_party),
    planTier: active.plan_tier,
    authorizationConfirmedAt: active.authorization_confirmed_at,
    lastVerifiedAt: active.last_verified_at,
    lastError: active.last_error,
    mailboxes: (mailboxes.data ?? []).map((m) => ({ email: m.email, status: m.status, dailyLimit: m.daily_limit })),
    syncs: (syncs.data ?? []).map((s) => ({ kind: s.kind, status: s.status, lastSuccessAt: s.last_success_at, lastError: s.last_error })),
    jobs: (jobs.data ?? []).map((j) => ({ id: j.id, type: j.type, status: j.status, attempts: j.attempts, lastError: j.last_error, updatedAt: j.updated_at })),
  };
}
