# Implementation plan

Works from [`CODEBASE_REVIEW_AND_PLAN.md`](CODEBASE_REVIEW_AND_PLAN.md), with findings from [`CURRENT_STATE_AUDIT.md`](CURRENT_STATE_AUDIT.md). One vertical slice per PR. Every new tenant-owned table follows [`data-model.md`](data-model.md):
- `tenant_id` and composite FKs
- RLS on reads and writes, plus explicit grants
- a cross-tenant test

The live Apollo gate and outbound campaign state machine are not touched by any phase here.

## Done

| PR / commit | Scope |
|---|---|
| `471356a` | Postgres job runner, scheduled syncs, reconciliation, "Sync now" |
| `ebc0359` | Fix silent truncation at the 1,000-row API cap |
| this PR | Team management: invite, add existing, change role, remove, resend; last-admin trigger; invite acceptance |

## PR next: finish Priority 0 hardening

Small, independent items, each with a test.

| Item | Change | Test |
|---|---|---|
| Activity integrity (audit §7.1) | Migration: `activities_insert` policy also requires `event_type in ('call_logged','note_logged','meeting_booked')`. Provider events stay service-role only. | DB: a rep can't insert `email_sent` or `positive_reply`, but can log a call |
| Security headers (§7.2) | `next.config.ts` `headers()`: CSP (self plus the Supabase origin), `frame-ancestors 'none'`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` | E2E: response headers present; app still works |
| Capped lists (§7.3) | Search box + paging for the enrollment picker and the new-opportunity company and contact pickers (server-side `ilike` with tenant filter); "next page" for prospect results | E2E with >500 synthetic contacts inserted via `tests/e2e/db.ts` |
| Retention (§7.6) | Job `maintenance.prune`: delete `jobs` in `succeeded`/`dead` older than 30 days and `idempotency_keys` older than 7 days (per tenant, batched) | DB/unit: only old terminal rows are removed |
| Health check | `GET /api/health`: app up, DB reachable (`select 1` via service role), no secrets or tenant data in the response | E2E: 200 and JSON shape |
| Ops docs | README: backups (Supabase PITR or daily), restore drill, rotating `CRON_SECRET` and the service-role key, production SMTP and templates | (docs) |

Acceptance: all suites green, no RLS weakened, audit §7.1–7.3 and §7.6 closed.

## Priority 1: shared attribution foundation (schema only, no UI)

New marketing domain alongside the CRM. `opportunities.source_campaign_id` stays outbound-only.

Migration `…_marketing_foundation.sql`:

```sql
marketing_connections (            -- per-tenant marketing data source (website, gsc, ga4, google_ads, meta_ads)
  id, tenant_id, provider text check (...), mode text check (mode in ('mock','live')),
  external_account_id, display_name, scopes text[], status (same set as provider_connections),
  credential_ref,                  -- server only: column not granted to authenticated
  authorization_confirmed_at, last_synced_at, last_error, created_at, updated_at,
  unique (tenant_id, id)
)
marketing_campaigns (              -- provider-neutral paid/organic campaign identity; NOT outbound campaigns
  id, tenant_id, marketing_connection_id, channel text check (channel in ('paid_search','paid_social','organic_search','organic_social','email','referral','direct','other')),
  external_id, name, status, created_at, updated_at,
  unique (tenant_id, id), unique (tenant_id, marketing_connection_id, external_id)
)
lead_inbound_events (              -- immutable first-party submissions and touches
  id, tenant_id, source_type text check (source_type in ('website_form','manual','import')),
  source_id uuid,                  -- e.g. website_forms.id
  occurred_at, landing_page text, referrer text,
  utm_source, utm_medium, utm_campaign, utm_content, utm_term,
  click_ids jsonb,                 -- gclid/msclkid only when the tenant's consent settings allow
  consent jsonb not null default '{}',
  dedupe_key text not null,        -- idempotency for retries and double submits
  contact_id uuid,                 -- set when matched or created
  payload_minimized jsonb not null default '{}',  -- no free-text PII beyond what the form needs
  created_at,
  unique (tenant_id, id), unique (tenant_id, dedupe_key),
  foreign key (tenant_id, contact_id) references contacts (tenant_id, id)
)  -- append-only trigger like audit_logs
lead_attribution (
  id, tenant_id, contact_id, opportunity_id null,
  model text check (model in ('first_touch','last_touch')),
  inbound_event_id null,           -- null + channel 'unknown' = unattributed, never guessed
  channel text not null,           -- includes 'unknown'
  marketing_campaign_id null, computed_at,
  unique (tenant_id, contact_id, model)
)
marketing_daily_metrics (
  tenant_id, marketing_connection_id, entity_type, external_entity_id, metric_date date,
  metric text, value numeric, currency text null, is_estimated boolean not null,
  ingested_at, primary key (tenant_id, marketing_connection_id, entity_type, external_entity_id, metric_date, metric)
)
```

- **Quote requests:** keep deriving them from `opportunities.quote_requested_at` (one milestone per opportunity, set by trigger). Document that a website "request a quote" form creates an opportunity at `quote_requested`, so it is counted once and never double-counted as both an event and a milestone.
- **RLS:**
  - members read
  - writes are server only (ingestion endpoints and jobs)
  - `credential_ref` is never granted
- **Tests:**
  - cross-tenant reads and writes
  - append-only events
  - dedupe key
  - `unknown` attribution when there are no touches
  - composite FK refusal

Acceptance: migrations apply, generated types updated, DB tests green, no UI.

## Priority 2: website form intake (first user-visible marketing feature)

The goal is connecting an existing website, not a CMS.

**Migration `…_website_forms.sql`:**

```sql
website_forms (
  id, tenant_id, name, status text check (status in ('draft','published','paused')),
  public_token_hash text not null unique,   -- sha256 of an opaque random token; token shown once
  allowed_origins text[] not null,          -- exact origins, checked against Origin header
  fields jsonb not null,                    -- declared fields + validation (email required)
  on_submit text check (on_submit in ('contact_only','task','opportunity_quote_requested')),
  default_owner_id uuid null,               -- FK (tenant_id, default_owner_id) → memberships
  created_at, updated_at, unique (tenant_id, id)
)
website_form_rate_limits (                  -- sliding window per form + client IP hash
  tenant_id, form_id, ip_hash, window_start, count, primary key (form_id, ip_hash, window_start)
)
```

**Routes:**
- `POST /api/forms/[token]/submit` (public). The token resolves the form and tenant server-side; any tenant id in the body is ignored. The route checks, in order:
  1. form published
  2. `Origin` in `allowed_origins`
  3. body size limit
  4. Zod validation against the declared fields
  5. honeypot field, plus optional Turnstile after verifying its docs
  6. rate limit per form and IP hash
  7. idempotency via a client `submission_id` → `dedupe_key`

  It then writes:
  - an inbound event with page, referrer and UTMs
  - a contact upsert using the existing dedupe (normalized email) and a company by email domain (skipping free-mail domains)
  - first- and last-touch attribution
  - the configured follow-up: a task, or an opportunity at `quote_requested`

  Suppressed emails are still recorded as leads but never auto-enrolled anywhere. The response is generic and doesn't reveal whether the contact existed.
- `GET /api/forms/[token]/embed.js`: a small script that posts to the endpoint and adds the UTM/referrer/landing page fields.
- `/app/[tenantSlug]/settings/website` (admins): create, publish or pause forms; rotate the token; set allowed origins; copy embed code; health status.
- `/app/[tenantSlug]/marketing/leads`: leads by source and channel (including "unknown") over a period, then lead to quote request to won, with links into the pipeline.

**BRS demo (synthetic):** a seeded form "Request a moving quote". A seeded submission carrying `utm_source=google&utm_medium=organic` flows through contact/company, attribution, the quote-requested opportunity, and the pipeline, ending as a won deal.

**Tests:**
- Unit: field validation, UTM parsing, dedupe key.
- DB: a token can't write another tenant's rows; events are append-only; rate-limit table.
- E2E: submit from an allowed origin creates a contact and opportunity and shows in Leads. A wrong origin is refused; a paused form is refused; a replayed `submission_id` creates no duplicate; a burst is rate-limited.

**Then:** an uptime check as a job (HEAD request to the tenant's site URL with bounded timeout and retries), shown on the Website page.

## Priority 3: SEO, read-only

Only after verifying the official GSC and GA4 auth, scopes, quotas and retention for per-tenant connections:
- Tables: `seo_properties`, `seo_queries_daily`, `seo_pages_daily`, `seo_issues`.
- Kept separate: GSC (search impressions, clicks, CTR, average position) and GA4 (sessions, conversions).
- Positions are labelled as averages, not exact ranks.
- Technical checks use a bounded, polite crawler.
- Mock adapters first.

## Priority 4: paid media, read-only

Use Google Ads and/or Meta, as client demand justifies, after verifying the official APIs:
- **Read-only ingestion:** campaigns, budgets, spend, impressions, clicks and conversions into `marketing_campaigns` and `marketing_daily_metrics`, with currency and time zone.
- **Dashboard:** CPL, cost per quote request, and cost per won deal. Platform-attributed and CRM-attributed outcomes stay separate.

## Priority 5: paid media writes

Not before every gate in brief §3 Priority 5 is designed and tested:
- immutable proposals
- separate propose and approve permissions
- server-side caps checked at every step
- a kill switch and dry run
- idempotent execution with a provider re-read before mutation

Built in new modules, never the outbound campaign state machine.

## Navigation (when marketing pages land)

- **Sales:** Overview, Prospects, Outbound (rename from Campaigns), Pipeline
- **Marketing:** Performance, Leads & Attribution, Website, SEO, Paid Ads
- **Settings:** Team, Integrations, Approval Policies

Every page shows the source's mode (demo or live) and freshness.
