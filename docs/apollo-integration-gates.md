# Apollo integration gates

Live Apollo calls and real sending stay **off** until every gate below is satisfied and recorded. API or OAuth availability alone is **not** licensing approval.

## Global gates (Commonbase)

- [ ] Written confirmation from Apollo that agency-provisioned, per-client Apollo accounts are permitted for this use. File it, and record who confirmed and when.
- [ ] Current official Apollo docs reviewed, with links and dates recorded here, for:
  - [ ] auth method for this setup (per-account OAuth or per-account API key)
  - [ ] scopes
  - [ ] endpoints needed for search, enrichment, contact creation, mailboxes, sequences, enrollment, activity, and opt-outs
  - [ ] pagination
  - [ ] rate limits and 429 behavior
  - [ ] credit consumption
  - [ ] permitted data use
  - [ ] retention and deletion obligations
  - [ ] webhooks and signature verification, if offered
- [ ] Live adapter (`src/server/providers/apollo/`) implemented **only** from the reviewed docs, fully mocked in CI.
- [ ] `APOLLO_LIVE_GATE=approved` set in the deployment environment.

Until then, everything listed above is **unverified**. Don't invent endpoints or substitute undocumented ones.

## Per-tenant gates

- [ ] Tenant's dedicated Apollo account provisioned (`apollo-account-provisioning.md`).
- [ ] Tenant's written authorization received; `provider_connections.authorization_confirmed_at` set.
- [ ] Credential stored encrypted (Supabase Vault). `credential_ref = vault:tenant/<tenant_id>/connection/<connection_id>`.
- [ ] Mailboxes set up, sending domain authenticated, warmup complete.
- [ ] Connection test passed (`last_verified_at` set, `status = connected`).
- [ ] Opt-out sync running on schedule and verified to write `suppression_entries`.
- [ ] Connection switched to `mode = live`.

## How the code enforces this

- The registry refuses `mode = live` unless `APOLLO_LIVE_GATE === "approved"` **and** `authorization_confirmed_at` is set.
- A DB check refuses a connected live connection without `authorization_confirmed_at` and `credential_ref`.
- The live adapter currently throws unconditionally.
- Credential refs are bound to tenant and connection; a mismatched ref is refused.
- Tested in `tests/integrations/provider-registry.test.ts`.
