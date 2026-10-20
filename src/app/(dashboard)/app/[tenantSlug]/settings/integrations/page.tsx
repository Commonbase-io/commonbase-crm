import type { Metadata } from "next";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { can } from "@/server/auth/roles";
import { requireTenantContext } from "@/server/auth/tenant-context";
import { loadApolloIntegration, type IntegrationView } from "@/server/tenants/integrations";

export const metadata: Metadata = { title: "Integrations" };

const STATUS_TONE: Record<IntegrationView["status"], "success" | "warning" | "danger" | "neutral"> = {
  connected: "success",
  pending: "warning",
  error: "danger",
  revoked: "danger",
  disconnected: "neutral",
};

const PARTY = { client: "Client", commonbase: "Commonbase" } as const;

export default async function IntegrationsPage({ params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;
  const ctx = await requireTenantContext(tenantSlug);
  if (!can(ctx.role, "integrations.view")) {
    return <EmptyState title="Admins and sales managers only">Ask a workspace admin about the Apollo connection.</EmptyState>;
  }
  const apollo = await loadApolloIntegration(ctx);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Apollo</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">This workspace&apos;s own dedicated Apollo account. Never shared with other workspaces.</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Badge tone={STATUS_TONE[apollo.status]}>{apollo.status}</Badge>
          {apollo.mode === "mock" ? <Badge tone="warning">Demo data</Badge> : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {apollo.mode === "mock" ? (
          <p className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
            Using the mock provider. Live Apollo access stays off until Commonbase has written approval from Apollo and this
            workspace&apos;s account is provisioned and verified. No real emails are sent.
          </p>
        ) : null}
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[12rem_1fr]">
          <dt className="text-muted-foreground">Account holder</dt>
          <dd>{apollo.accountHolder ? PARTY[apollo.accountHolder] : "—"}</dd>
          <dt className="text-muted-foreground">Billed to</dt>
          <dd>{apollo.billingParty ? PARTY[apollo.billingParty] : "—"}</dd>
          <dt className="text-muted-foreground">Plan</dt>
          <dd>{apollo.planTier ?? "—"}</dd>
          <dt className="text-muted-foreground">Written authorization</dt>
          <dd>{apollo.authorizationConfirmedAt ? formatDate(apollo.authorizationConfirmedAt) : "Not recorded"}</dd>
          <dt className="text-muted-foreground">Last verified</dt>
          <dd>{formatDate(apollo.lastVerifiedAt)}</dd>
          {apollo.lastError ? (
            <>
              <dt className="text-muted-foreground">Last error</dt>
              <dd className="text-danger">{apollo.lastError}</dd>
            </>
          ) : null}
        </dl>

        <div>
          <h3 className="text-sm font-semibold">Mailboxes</h3>
          {apollo.mailboxes.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">No mailboxes.</p>
          ) : (
            <ul className="mt-2 divide-y rounded-md border text-sm">
              {apollo.mailboxes.map((m) => (
                <li key={m.email} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <span className="break-all">{m.email}</span>
                  <span className="text-muted-foreground">{m.status} · {m.dailyLimit}/day</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h3 className="text-sm font-semibold">Sync</h3>
          {apollo.syncs.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">No sync has run yet.</p>
          ) : (
            <ul className="mt-2 divide-y rounded-md border text-sm">
              {apollo.syncs.map((s) => (
                <li key={s.kind} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <span>{s.kind.replace("_", " ")}</span>
                  <span className={s.status === "failed" ? "text-danger" : "text-muted-foreground"}>
                    {s.status === "failed" ? `Failed: ${s.lastError ?? "unknown error"}` : `Last success ${formatDate(s.lastSuccessAt)}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
