# Architecture

Modular monolith on Next.js (App Router), Supabase Postgres and Auth, deployed to Vercel.

```
Browser
  └─ Next.js UI (server components; client components only for interactivity)
       └─ server services (src/server/*)
            ├─ authenticate         requireSessionUser()        Supabase Auth, getUser() re-validates the JWT
            ├─ authorize tenant     requireTenantContext(slug)  tenant id comes from the user's membership row, never the browser
            ├─ authorize action     assertCan(role, permission) src/server/auth/roles.ts
            ├─ data                 user client (RLS) by default; service-role client only after the checks above
            └─ providers            getProviderRegistry().forTenant(ctx)
                                       └─ tenant's own connection → credential resolver → mock adapter (now) / live Apollo (gated)
```

## Tenant isolation, in layers

1. **URL slug is not trusted.** `requireTenantContext` looks up the signed-in user's membership for that slug under RLS. Non-members get a 404, so slugs can't be probed.
2. **RLS on every table**, reads and writes (`supabase/migrations/*_rls.sql`). Anon has no privileges at all.
3. **Column grants.** The authenticated role cannot read `provider_connections.credential_ref`, cannot change campaign `status`, and can only update `memberships.role`.
4. **Composite foreign keys** `(tenant_id, id)` everywhere, so even the service role cannot make a row reference another tenant's row. Polymorphic `notes` use a trigger for the same guarantee.
5. **Database backstops for campaign safety**: a state machine trigger, an approval compliance check (postal address and unsubscribe tokens), frozen steps after draft, and an enrollment trigger that rejects suppressed emails and domains.
6. **Explicit checks in service-role code**, because it bypasses RLS. Always filter by `ctx.tenantId`.

## Providers

- `src/server/providers/interfaces` holds provider-neutral `ProspectingProvider` and `OutreachProvider` interfaces and domain types. External ids are opaque strings stored only on tenant-scoped rows.
- `src/server/providers/registry.ts` builds adapters **per request** from the tenant's connection. There is no module-level client. It refuses to proceed (`ProviderUnavailableError`) when:
  - the connection's tenant doesn't match the request (`tenant_mismatch`)
  - the connection isn't `connected`
  - the credential ref isn't bound to that tenant's connection (`credential_mismatch`)
  - live mode is requested while the gate is locked or no written authorization is recorded (`live_blocked`)
- `credentials.ts` resolves `credential_ref` server-side. `ProviderCredential` never serializes or prints its secret.
- `mock-apollo/` is deterministic per connection. It makes no network calls and sends nothing.
- `apollo/` is the live adapter. It deliberately throws until every gate in `apollo-integration-gates.md` is met.

## Background work

The `jobs` and `sync_jobs` tables exist. The runner (simulated sync, opt-out sync, reconciliation) is the next build step. Trigger.dev comes after live sync is unblocked.

## Logging

Use `src/server/log.ts` only. It runs everything through `redact()`, which strips emails, name-like keys, bearer tokens, JWTs, and long opaque keys.
