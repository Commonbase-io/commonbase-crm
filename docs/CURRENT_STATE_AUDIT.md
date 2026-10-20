# Current state audit

**Date:** 2026-10-20
**Branch:** `claude/ecstatic-archimedes-udsftw`
**Baseline audited:** `471356a` (one commit after the reviewed tree `342908f`: "Add background job runner")
**Brief:** [`CODEBASE_REVIEW_AND_PLAN.md`](CODEBASE_REVIEW_AND_PLAN.md)

Everything below was checked in a local environment (Node 22.22, Postgres 16 for `test:db`, the local Supabase stack in Docker on Postgres 17, Chromium via Playwright). Where something was not run, it says so.

## 1. Delta from the reviewed tree

The review looked at `342908f`. One commit landed before this audit:

- `471356a` **Add background job runner.** This covers most of the review's gap #1 ("No completed background runner"):
  - queue functions `enqueue_job` / `claim_jobs` with dedupe, `FOR UPDATE SKIP LOCKED` and stale-lease recovery (`supabase/migrations/20261020000009_job_runner.sql`)
  - runner with backoff and dead letters (`src/server/jobs/runner.ts`)
  - opt-out sync, email activity sync and enrollment reconciliation handlers (`src/server/jobs/handlers.ts`)
  - cron endpoint (`src/app/api/jobs/run/route.ts`)
  - "Sync now" plus a job list on Integrations

This audit's PR adds two more commits: the truncation fix and team management (sections 4 and 5).

## 2. Baseline commands (at `471356a`, before any change in this PR)

| Command | Result |
|---|---|
| `npm ci` | OK. `npm audit` reports 5 high-severity issues, all in dev tooling (`braces` via `eslint-config-next` → `@next/eslint-plugin-next` → `fast-glob`). `npm audit --omit=dev`: **0 vulnerabilities**. The suggested fix downgrades `eslint-config-next` to 14, so it was not applied. |
| `npm run typecheck` | Pass |
| `npm run lint` | Pass (0 warnings) |
| `npm test` (unit + integration) | **54 passed** (9 files) |
| `npm run test:db` (RLS, isolation, DB safety on Postgres 16 + Supabase shim) | **41 passed** (5 files) |
| `npm run build` | Pass |
| `npm run test:e2e` (Playwright vs local Supabase, desktop + mobile) | **40 passed**, 24 skipped (data-writing specs run on desktop only, by design) |

After this PR: typecheck and lint pass; **61** unit, **47** DB and **49** E2E tests pass (section 6).

## 3. What works (verified by code and tests)

| Area | Evidence |
|---|---|
| Tenant resolution from membership, never the browser | `src/server/auth/tenant-context.ts` (slug → RLS-visible membership; 404 for non-members). E2E: cross-tenant URL shows "Not found". |
| RLS on reads and writes; anon has nothing; `credential_ref` hidden by column grants | `supabase/migrations/20261020000008_rls.sql`; `tests/tenant-isolation/rls-*.test.ts` |
| Composite tenant FKs, even for the service role | `rls-writes.test.ts` "composite foreign keys stop cross-tenant references…" |
| Provider registry: per request, tenant-bound credential refs, live gate locked | `src/server/providers/registry.ts`, `credentials.ts`; `tests/integrations/provider-registry.test.ts` (tenant A can't get B's adapter or credential) |
| Live Apollo blocked | `src/server/providers/apollo/index.ts` always throws; registry requires `APOLLO_LIVE_GATE=approved` **and** `authorization_confirmed_at` |
| Prospect finder | `src/server/crm/prospects.ts`; E2E search, save, enrich, dedupe, role gating |
| Campaigns: approval gate, suppression at enrollment, idempotency, reconciliation | `src/server/campaigns/*`; DB triggers in `..._outreach.sql`; E2E full flow |
| Pipeline: board/table, lost reason (UI, server, DB), rep ownership | `src/server/crm/pipeline.ts`; E2E |
| Background jobs | Section 1; DB tests for dedupe, SKIP LOCKED and stale leases (`tests/tenant-isolation/job-queue.test.ts`); E2E for cron auth and "Sync now" |
| Audit log append-only, even for the service role | `..._operations.sql` trigger; DB test |
| Logs redact emails, names and tokens | `src/server/compliance/redact.ts`, `src/server/log.ts`; unit test |

## 4. Defects found and fixed in this PR

### 4.1 Silent truncation at the API's 1,000-row cap (fixed: `ebc0359`)

`supabase/config.toml:18` sets `max_rows = 1000`. Hosted Supabase also caps reads, by default at 1,000. PostgREST returns at most that many rows **without an error**. Reproduced locally: the service role asked for a tenant's 1,201 suppression rows and received exactly 1,000.

Affected reads at baseline:

| Location | Impact |
|---|---|
| `src/server/crm/prospects.ts:27` (whole suppression list) | Suppressed domains past row 1,000 were **not hidden** in the prospect finder. An E2E test (`prospects.spec.ts`, "…1,000-row cap…") **fails on the old code** and passes on the fix. |
| `src/server/campaigns/campaigns.ts:533` (all enrollments of a campaign) | Past 1,000 enrollees, already-enrolled contacts could look new and be **re-sent to the provider**. The mock provider dedupes; a real one might not. |
| `src/server/campaigns/campaigns.ts:449` (whole suppression list at enrollment) | Missed suppressions. The DB trigger still blocked the enrollment, so nothing unsafe was sent, but the whole batch failed. |
| `src/server/crm/overview.ts:30-34`, `src/server/crm/pipeline.ts:82`, `campaigns.ts:74`, `:195`, reconciliation reads | Undercounted KPIs, pipeline and enrolled counts; reconciliation missed rows. |

**Fix:**
- Suppressions are looked up only for the emails and domains in question (`src/server/compliance/suppression-lookup.ts`).
- Enrollment reads only the selected contacts.
- Complete reads page below the cap (`src/server/supabase/paginate.ts`, unit tested against a simulated capped API).

### 4.2 Team management was missing

This was the review's gap #4. Implemented in this PR; see section 5.

## 5. Team management (this PR's increment)

**Admins can:**
- invite by email (Supabase invite email, then a set-password page)
- add an existing account directly
- change roles
- remove members
- resend an invite

Safeguards, each enforced in more than one place:

| Rule | App (`src/server/tenants/team-rules.ts`, `team.ts`) | Database |
|---|---|---|
| Only `tenant_admin` manages the team | `assertCan("team.manage")` | RLS `memberships_*_admin` policies |
| Nobody changes or removes their own membership | `checkMembershipChange` → "self" | RLS `user_id <> auth.uid()` |
| A workspace always keeps an admin | → "last_admin" | trigger `memberships_keep_admin` (`..._team_management.sql`); blocks the service role too, and allows tenant deletion |
| Membership writes run as the admin, not the service role | `team.ts` uses the user client | RLS applies |
| Account lookups (email → user, member sign-in state) are server only | service role after `assertCan` | functions executable by `service_role` only (DB test) |
| Invite links go to a server-side verifier; `next` must be a same-origin path | `src/app/auth/confirm/route.ts` (`safeNext`) | Supabase verifies the OTP |
| Audited | `team.member_invited/added`, `team.role_changed`, `team.member_removed`, `team.invite_resent` (ids and roles only) | append-only `audit_logs` |

**Tests:** unit (`team-rules.test.ts`), DB (`tests/tenant-isolation/team.test.ts`), and E2E (`tests/e2e/team.spec.ts`). The E2E run covers:
- the real invite email via Mailpit, link, set password, sign-in
- used or forged link rejected, including `next=//evil.example`
- existing-account add, role change taking effect, and removal revoking access immediately
- duplicate refused, resend works
- no self-controls; managers get no controls and can't see emails

### Manual verification checklist (team management)

Local stack (`npm run db:reset`, `npm run dev`); emails arrive in Mailpit at http://127.0.0.1:54324.

1. Sign in as `admin@brs-demo.example` and open Settings → Team. You see an invite form, members' emails, role selectors, and Remove buttons. Your own row has none of these.
2. Invite a new address as Sales rep. You see "Invite sent", and the row shows **Invited**.
3. In Mailpit, open the invite and click the link. You land on "Set your password". Mismatched passwords are refused; matching ones take you to the BRS overview as a Sales rep.
4. Sign out and back in with the new password; it works. As admin, the row no longer says Invited.
5. Click the same email link again: "That link is invalid or has expired."
6. Add `rep@harbor-demo.example`, which already has an account: "Added…", with no email sent. Sign in as them: you get a workspace chooser with both workspaces.
7. Change their role to Sales manager; they now see "New campaign" in BRS. Remove them; their next page load in BRS shows "Not found".
8. Invite someone, then click **Resend invite**: a second email arrives.
9. Sign in as `manager@brs-demo.example`: no invite form, no emails, no controls.
10. In SQL as `postgres`, try to delete the last admin of a tenant: you get "a workspace must keep at least one admin".
11. In the audit log (`select action, metadata from audit_logs order by created_at desc`), the `team.*` entries hold ids and roles only, no emails.

## 6. Test results after this PR

| Command | Result |
|---|---|
| `npm run typecheck` / `npm run lint` | Pass / pass |
| `npm test` | **61 passed** |
| `npm run test:db` | **47 passed** |
| `npm run build` | Pass |
| `npm run test:e2e` | **49 passed**, 33 skipped (desktop-only data-writing specs) |

## 7. Partial, missing, and open risks (not fixed here)

Ordered by priority. Each has a plan entry in [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md).

1. **Members can log arbitrary activity types.** `supabase/migrations/20261020000008_rls.sql:135-137` allows any member to insert `email_sent`, `positive_reply` and so on (only `external_event_id` must be null). A rep could inflate overview KPIs. Restrict manual inserts to `call_logged`, `note_logged` and `meeting_booked`.
2. **No security headers.** `next.config.ts` sets none (no CSP, `frame-ancestors` or `X-Frame-Options`), so pages can be framed (clickjacking).
3. **UI lists still capped without saying so.**
   - `campaigns.ts:202` `.limit(500)` (enrollable contacts)
   - `pipeline.ts:266-267` `.limit(500)` and `.limit(2000)`; the latter is effectively 1,000 because of `max_rows`
   - Prospect search shows only the provider's first page (`prospect-filters.ts:66`, `perPage = 100`)
   These need search or pagination, not bigger limits.
4. **KPIs are computed in application code.** `overview.ts` now reads completely (paged), which is fine at pilot volumes. Move to SQL aggregates before high-volume web or ad events arrive.
5. **One global mock/live badge.** `overview.ts:84` derives `dataMode` from the Apollo connection. Marketing sources will need per-source provenance and freshness.
6. **Unbounded growth.** `jobs`, `idempotency_keys` and `audit_logs` have no retention. Add a cleanup job for the first two; audit retention is a policy decision.
7. **Login has no app-level rate limit.** It relies on Supabase Auth limits (`supabase/config.toml` `[auth.rate_limit]`; raised locally for tests).
8. **Existing customers are excluded from prospect search only.** Enrollment shows a "Customer" badge (`campaigns.ts:213`) but doesn't block. This is a product decision.
9. **Admins can add any existing account by email** without the person accepting. That's acceptable for Commonbase-operated onboarding; consider an acceptance step before self-serve onboarding.
10. **Production email.** Invites need custom SMTP (Supabase's built-in sender is heavily rate-limited), the two templates in `supabase/templates/` configured in the hosted project, and `site_url` set to the app URL.
11. **Cron frequency** depends on the Vercel plan (`vercel.json` asks for every 15 minutes).

## 8. Blockers (unchanged)

- **Live Apollo:** blocked pending written approval from Apollo for agency-provisioned per-client accounts (`docs/apollo-integration-gates.md`). Nothing in this PR touches the gate.
- **Marketing integrations** (GSC, GA4, Google Ads, Meta): not started. Each needs official-docs verification and per-tenant accounts before any code.
