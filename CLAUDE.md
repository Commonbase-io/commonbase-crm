# Commonbase Sales OS: Claude Project Instructions

## Mission
Build a secure, reusable, multi-tenant B2B sales application for Commonbase. BRS (a commercial moving company) is the first pilot tenant. Authorized users manage companies, contacts, opportunities, and outbound campaigns through a branded dashboard. Apollo is a **replaceable** prospecting/outreach integration, not the system of record. Commonbase Postgres owns CRM state.

## Apollo account model
- **Every client tenant gets its own dedicated Apollo account.** Commonbase provisions it during onboarding. No Apollo account, credential, seat, credit balance, mailbox, sequence, or contact list is ever shared between tenants.
- Exactly one active Apollo connection per tenant. Enforce with a partial unique index on `provider_connections(tenant_id, provider) where status in ('pending','connected')`.
- Record on each connection: who is the Apollo account holder (client or Commonbase), who pays for it, plan tier, and the date written authorization was received. These are operational facts, not secrets.
- Credentials are per account, encrypted at rest, referenced by `credential_ref` only, and resolved server-side at call time. Support either per-account OAuth or a per-account API key, whichever Apollo's current docs and terms permit for this setup. Do not assume one; verify.
- Offboarding a tenant revokes its Apollo credential, stops all active sequences, and exports or deletes provider-mapped data per Apollo's retention terms and the client contract.
- Write `docs/apollo-account-provisioning.md`: a manual runbook covering account creation, ownership and billing, plan selection, mailbox and sending-domain setup, warmup, credential capture, connection test, and offboarding.

## Critical constraints
1. **Do not enable live Apollo API calls or real sending until Commonbase has confirmed, in writing from Apollo, that agency-provisioned per-client accounts are permitted for this use, and the tenant's account is provisioned and verified.** API or OAuth availability alone is not licensing approval.
2. Begin with a **mock Apollo adapter** and seeded, clearly synthetic demo data. No real email sends in development.
3. Never expose provider credentials to the browser, logs, or other tenants.
4. Every tenant-owned record and background job is scoped to an authenticated, authorized tenant. Enforce isolation in RLS, application services, and tenant-scoped composite foreign keys. Never trust browser-supplied tenant IDs.
5. Treat endpoint names, auth methods, scopes, capabilities, rate limits, retention rules, and pricing as **unverified until checked against current official Apollo documentation**. Do not invent integrations or substitute undocumented endpoints.
6. Modular monolith. No microservices, billing, or AI outreach agent in the MVP.

## Stack
- Next.js App Router, React, TypeScript (strict)
- Tailwind CSS and shadcn/ui
- Supabase Postgres and Auth; SQL migrations and RLS
- Server-only provider adapters
- Background work: start with a simple Postgres-backed job table and a server-side runner. Adopt Trigger.dev when live sync is unblocked.
- Vercel deployment target
- Zod validation; Vitest for unit/integration; Playwright for critical E2E flows only
- Sentry optional after core functionality

## MVP scope

### Build now
**1. Tenant administration**
- Tenant creation and onboarding (Commonbase-operated for now)
- Users and memberships with roles `tenant_admin`, `sales_manager`, `sales_rep`
- Integration page showing Apollo connection status: `disconnected`, `pending`, `connected`, `error`, `revoked`, plus account holder and authorization date

**2. Overview**
- KPI cards: qualified conversations, quote requests, won deals and value, positive replies, prospects added, emails sent. Lead with the first three.
- Quote-to-win rate and median days from first touch to quote request
- Date and campaign filters; clearly label mock vs live metrics
- Funnel: contacted -> replied -> qualified -> quote requested -> won

**3. Prospect finder**
- Filter by geography, industry, company size, job title, and trigger event
- Search through `ProspectingProvider`; mock adapter first
- Review, save, deduplicate (by domain for companies, by normalized email or provider ID for contacts), optionally enrich
- Track provenance and enrichment status; search results do not imply verified emails
- Exclude suppressed emails, suppressed domains, and existing customers

**4. Campaign manager**
- Campaign list, draft editor, sequence steps, sender (mailbox) selection, approval, enrollment, pause, status
- `OutreachProvider` abstraction; mock adapter first
- States: `draft`, `approved`, `enrolling`, `active`, `paused`, `completed`, `failed`
- Explicit human approval and a suppression check immediately before any enrollment or activation
- Durable idempotency keys and reconciliation so timeouts and retries never duplicate enrollment
- No live sending in initial implementation

**5. CRM pipeline**
- Stages: `new`, `contacted`, `interested`, `qualified`, `quote_requested`, `proposal_sent`, `won`, `lost`
- Companies, contacts, owners, notes, tasks, activities, estimated deal values
- Kanban and table views; source campaign and quote attribution
- Required `lost_reason` when moving to `lost`

### Deferred until tenant #2 is signed
- Workspace switcher for users in multiple tenants (schema supports it now; UI later)
- Audited Commonbase support-access flow (until then, Commonbase staff get explicit memberships, and every action is audit logged)
- Trigger.dev migration
- Self-serve tenant onboarding

## BRS context (pilot tenant)
Commercial moving demand is event-driven. Timing matters more than title.
- Buyers: facilities managers, office managers, operations directors, real estate and workplace leads, sometimes CFOs at smaller firms
- Trigger events worth tracking on companies: lease expiration, announced relocation or new office, headcount growth, funding round, M&A, facility consolidation
- Prioritize accounts with a recent or upcoming trigger event over pure title matches
- Keep all BRS specifics in seed data and tenant config, never in shared components

## Architecture
`Next.js UI -> authenticated server services -> tenant authorization -> Postgres/RLS + provider adapter (resolved per tenant connection) -> mock Apollo now / tenant's own Apollo account later`

```ts
interface ProspectingProvider {
  searchPeople(filters: ProspectFilters): Promise<ProspectSearchResult>;
  enrichPerson(personId: string): Promise<EnrichedContact>;
  createContact(contact: ContactInput): Promise<string>;
}

interface OutreachProvider {
  listMailboxes(): Promise<Mailbox[]>;
  createSequence(input: SequenceInput): Promise<string>;
  enrollContacts(input: EnrollmentInput): Promise<EnrollmentResult>;
  activateSequence(sequenceId: string): Promise<void>;
  pauseSequence(sequenceId: string): Promise<void>;
  getEmailActivity(input: ActivityFilters): Promise<EmailActivity[]>;
  getOptOuts(since: Date): Promise<OptOut[]>;
}
```

- Adapters are constructed per request from the tenant's connection record. There is no global or module-level Apollo client.
- Domain types stay provider-neutral. External IDs live only in tenant-scoped records.
- No Apollo calls from client components.

## Data model
All tenant-owned tables carry `tenant_id`, `created_at`, `updated_at`, and use composite foreign keys `(tenant_id, id)` so a row can never reference another tenant's row.

- `tenants(id, name, slug unique, created_at)`
- `profiles(id, display_name)` linked to Supabase Auth users
- `memberships(tenant_id, user_id, role)` unique `(tenant_id, user_id)`
- `provider_connections(id, tenant_id, provider, external_account_id, account_holder, billing_party, plan_tier, authorization_confirmed_at, credential_ref, status, last_verified_at, last_error)` with the one-active-connection partial unique index above
- `mailboxes(id, tenant_id, provider_connection_id, email, external_id, status, daily_limit)`
- `companies(id, tenant_id, name, domain, industry, location, employee_count, is_customer, external_ref)` unique `(tenant_id, domain)` where domain is not null
- `company_trigger_events(id, tenant_id, company_id, event_type, event_date, source, notes)`
- `contacts(id, tenant_id, company_id, name, title, email, email_normalized, external_ref, enrichment_status, source)` unique `(tenant_id, email_normalized)` where not null
- `campaigns(id, tenant_id, provider_connection_id, mailbox_id, external_id, name, status, approved_by, approved_at)`
- `sequence_steps(id, tenant_id, campaign_id, position, step_type, delay_days, subject, body)` unique `(tenant_id, campaign_id, position)`
- `campaign_contacts(tenant_id, campaign_id, contact_id, enrollment_status, enrolled_at, external_ref)` primary key `(tenant_id, campaign_id, contact_id)`
- `activities(id, tenant_id, contact_id, campaign_id, event_type, occurred_at, external_event_id)` unique `(tenant_id, external_event_id)` where not null
- `opportunities(id, tenant_id, company_id, contact_id, owner_id, stage, estimated_value, source_campaign_id, quote_requested_at, closed_at, lost_reason)`
- `notes(id, tenant_id, entity_type, entity_id, author_id, body)`
- `tasks(id, tenant_id, owner_id, contact_id, opportunity_id, title, due_at, completed_at)`
- `suppression_entries(id, tenant_id, scope, value_hash, reason, source, created_at)` where `scope` is `email` or `domain`; unique `(tenant_id, scope, value_hash)`
- `idempotency_keys(tenant_id, key, operation, status, response, created_at)` primary key `(tenant_id, key)`
- `jobs(id, tenant_id, type, status, payload, attempts, run_after, last_error)`
- `sync_jobs(id, tenant_id, provider_connection_id, kind, status, cursor, last_success_at, last_error)`
- `audit_logs(id, tenant_id, actor_id, action, metadata, created_at)` append only

RLS covers reads **and** writes. Members cannot change their own role. Only `tenant_admin` manages memberships. Only server code touches `provider_connections.credential_ref`. The service-role key stays server-side, and service-role code performs explicit authorization checks because it bypasses RLS.

## Compliance
- Opt-outs that happen inside Apollo must sync back to `suppression_entries` on a schedule, and before every enrollment. This is required, not optional.
- Honor opt-outs within 10 business days at the latest (CAN-SPAM). Target same day.
- Every outbound template must include the sender's physical postal address and a working unsubscribe mechanism. Block approval if either is missing.
- Suppression is checked at enrollment time, not only at prospect save time.
- Logs redact emails, names, and tokens.

## Integration plan
### Phase A: mock provider (build now)
- Deterministic mock search, enrichment, mailbox listing, sequence creation, enrollment, activity events, and opt-outs
- Seed BRS and a second synthetic tenant, each with its own mock Apollo connection, to prove per-account isolation
- UI shows `Demo data` until the tenant's real, approved connection is active

### Phase B: per-client Apollo accounts (blocked pending written approval)
- Verify current Apollo docs: supported auth method for this setup, scopes, endpoints, pagination, rate limits, credit consumption, permitted data use, retention and deletion obligations
- Store each tenant's credential encrypted; handle refresh, expiry, and revocation
- Map provider IDs to local records; incremental sync with cursors per connection
- Respect 429s with backoff, per-account daily quotas, and webhook signatures if webhooks exist
- Search results may need separate enrichment and contact creation before enrollment
- Connection health check on save and on a schedule; surface failures on the integration page

## Routes
- `/login`
- `/app/[tenantSlug]/overview`
- `/app/[tenantSlug]/prospects`
- `/app/[tenantSlug]/campaigns`
- `/app/[tenantSlug]/pipeline`
- `/app/[tenantSlug]/settings`
- `/app/[tenantSlug]/settings/integrations`
- `/app/[tenantSlug]/settings/team`

## Acceptance criteria
- Tenant A cannot view, update, export, or trigger jobs against Tenant B data or credentials, including via guessed IDs
- A request scoped to Tenant A can never construct an adapter with Tenant B's Apollo credential (test this directly)
- RLS blocks cross-tenant reads and writes; tested with two users and two tenants
- Every API route validates identity, membership, role, and input
- Secrets stay server-side; logs redact PII and tokens
- No campaign activation without explicit approval, a postal address, and an unsubscribe mechanism
- Suppressed emails and suppressed domains cannot be enrolled
- Retries cannot duplicate enrollment; failed syncs are visible and recoverable
- Accessibility basics, loading, empty, and error states, mobile responsive
- All external calls mocked in CI

## Folder structure
```text
src/
  app/(auth)/
  app/(dashboard)/app/[tenantSlug]/
  app/api/
  components/ui/
  components/dashboard/
  server/auth/
  server/tenants/
  server/crm/
  server/campaigns/
  server/compliance/
  server/jobs/
  server/providers/interfaces/
  server/providers/registry.ts   # builds an adapter from a tenant's connection
  server/providers/mock-apollo/
  server/providers/apollo/       # do not activate until approved
  lib/
supabase/migrations/
supabase/tests/
tests/tenant-isolation/
tests/integrations/
docs/
```

## Delivery sequence
1. Inspect the repository before changing anything. If empty, scaffold.
2. Write `docs/architecture.md`, `docs/data-model.md`, `docs/apollo-integration-gates.md`, `docs/apollo-account-provisioning.md`, and a short phased checklist.
3. Design system and responsive dashboard shell.
4. Schema, migrations, auth, memberships, RLS.
5. Seed BRS and a second synthetic tenant, each with its own mock Apollo connection.
6. Overview, prospects, campaigns, pipeline, settings on the mock provider.
7. Tenant isolation, role permission, credential isolation, suppression, and campaign safety tests.
8. Postgres job table with simulated sync, opt-out sync, and reconciliation.
9. Document environment variables, setup, tests, and deployment.
10. Only after explicit confirmation, implement the real Apollo adapter.

## First coding session
Start implementing, not outlining. Inspect the repo and report what exists. Create the docs, scaffold if needed, and build the foundation: tenant-aware navigation, auth, migrations with RLS, the provider registry, and synthetic seed data for two tenants. Run type checks and tests. Report files created, commands run, failures, and next steps. Without credentials, keep using the mock provider. Do not claim untested functionality works.

## Design direction
Premium, restrained B2B SaaS: neutral backgrounds, clear typography, compact tables, useful filters, accessible components, fast workflows. No BRS branding in shared components. Optimize for qualified conversations, quote requests, and won deals, not email volume.
