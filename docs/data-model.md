# Data model

The source of truth is `supabase/migrations/`. Generated TypeScript types are in `src/lib/database.types.ts` (`npm run db:types`).

## Conventions

- Every tenant-owned table has `tenant_id`, `created_at`, `updated_at`, and `unique (tenant_id, id)`.
- Children reference parents with composite FKs `(tenant_id, parent_id)`.
- Enumerations are `text` columns with check constraints.
- `updated_at` is maintained by `app.set_updated_at()`.
- Private helpers live in the `app` schema, which the Data API doesn't expose.

## Tables

| Table | Notes |
|---|---|
| tenants | `slug` unique; `postal_address` (required to approve campaigns); `config` jsonb for tenant-specific settings such as trigger event types and target titles |
| profiles | 1:1 with `auth.users`; created by trigger |
| memberships | PK `(tenant_id, user_id)`; role `tenant_admin`, `sales_manager`, or `sales_rep` |
| provider_connections | One `pending` or `connected` row per tenant and provider (partial unique index). Holds `mode` (`mock` or `live`), `account_holder`, `billing_party`, `plan_tier`, `authorization_confirmed_at`, and `credential_ref` (server only). A live connection can't be `connected` without an authorization date and a credential. A revoked connection has no credential. |
| mailboxes | Belong to a connection; unique `(tenant_id, provider_connection_id, id)` lets campaigns require a mailbox from their own connection |
| companies | Dedupe on `(tenant_id, domain)`; domain stored normalized; `is_customer` |
| company_trigger_events | snake_case `event_type`; vocabulary set per tenant in `tenants.config` |
| contacts | `email_normalized` is a generated column; dedupe on `(tenant_id, email_normalized)` and `(tenant_id, external_ref)`; `email_status` defaults to `unverified` |
| suppression_entries | `scope` is `email` or `domain`; `value_hash = sha256(lower(trim(value)))`, never the raw value |
| campaigns | Status machine `draft → approved → enrolling → active ⇄ paused → completed`, plus `failed`. Non-draft requires approver, approval time, and mailbox. |
| sequence_steps | Unique `(tenant_id, campaign_id, position)`; frozen once the campaign leaves draft |
| campaign_contacts | PK `(tenant_id, campaign_id, contact_id)` makes retries unable to duplicate enrollment |
| activities | Event log; idempotent on `(tenant_id, external_event_id)` |
| opportunities | Stages `new` through `won` or `lost`; `lost_reason` required for `lost`; milestone timestamps (`first_touch_at`, `qualified_at`, `quote_requested_at`, `closed_at`) maintained by trigger; owner must be a tenant member |
| notes | Polymorphic target validated in the same tenant by trigger |
| tasks | Owner, contact, and opportunity are all tenant-scoped |
| idempotency_keys | PK `(tenant_id, key)` plus `request_hash`; no authenticated access |
| jobs, sync_jobs | Postgres-backed queue and per-connection sync cursors |
| audit_logs | Append only, even for the service role (a trigger blocks update and delete; tenant deletion cascades) |

Deviations from the original spec, on purpose: `tenants.postal_address` and `config`; `provider_connections.mode`; `contacts.email_status`; `opportunities.title` and milestone columns; `campaigns.last_error`; `jobs.max_attempts`, `locked_at`, and `locked_by`; `idempotency_keys.request_hash`. Each one supports a stated requirement.

## RLS summary

| Who | Can |
|---|---|
| anon | nothing |
| any member | read their tenant's rows; write companies, contacts, trigger events, tasks, notes (own), activities (manual only), and suppressions (add only) |
| sales_rep | edit only opportunities they own; can't reassign them |
| sales_manager | the rep's permissions, plus delete CRM rows, edit draft campaigns and steps, read jobs and sync state |
| tenant_admin | the manager's permissions, plus manage other members' memberships, remove suppressions, read audit logs |
| everyone | can't change their own membership; can't read `credential_ref`; can't change campaign status or enroll contacts (server only) |

## Checklist for every new table

1. `tenant_id` plus `unique (tenant_id, id)` plus composite FKs to parents
2. `updated_at` trigger
3. `enable row level security`
4. Explicit `grant`s to `authenticated` (Supabase's defaults are revoked) and policies for select, insert, update, and delete
5. A cross-tenant test in `tests/tenant-isolation/`
