# Commonbase Sales OS: verified codebase review and Claude Code implementation brief

**Reviewed repository:** `Commonbase-io/commonbase-crm`  
**Branch:** `claude/ecstatic-archimedes-udsftw`  
**Git tree SHA:** `342908f53676aca006da58e894f8d9d02db1295a`  
**Review date:** 2026-10-20  
**Evidence:** GitHub repository tree and selected source/docs files. This was a remote static review, **not** a local build or executed test run. Distinguish checked source facts from unverified runtime behavior.

## 1. Executive assessment

The repository is **well beyond a blank scaffold**. It is a substantial **mock-backed, multi-tenant B2B sales MVP**, with prospecting, outbound campaigns, CRM pipeline, overview metrics, role-aware tenant routing, Supabase schema/RLS, and meaningful automated test coverage. It is **not yet a live Apollo-powered platform** or a website/SEO/paid-media management product.

**Recommendation:** complete operational reliability and team management, then add a shared first-party marketing attribution/event model and website-form ingestion. This becomes the connective tissue between website, SEO, paid media, and CRM outcomes. Build external integrations read-only before enabling any provider write operations.

## 2. Verified implementation inventory

| Area | Status supported by inspected files | Evidence |
|---|---|---|
| Application | Next.js 16 App Router, React 19, TypeScript strict, Tailwind 4, Supabase Auth/Postgres | `package.json`, `README.md` |
| Tenant security | Tenant context resolved from authenticated memberships, role permissions, RLS and composite tenant FKs documented/implemented | `src/server/auth/*`, `supabase/migrations/20261020000008_rls.sql`, `docs/architecture.md` |
| Dashboard | Overview KPI/funnel/date/campaign filters, synthetic vs live labeling | `src/server/crm/overview.ts`, `src/server/crm/overview-metrics.ts`, `src/app/(dashboard)/app/[tenantSlug]/overview/page.tsx` |
| Prospecting | Mock provider search, review, deduplication, suppression/customer exclusion, save/enrichment workflow | `src/server/crm/prospects.ts`, `src/server/providers/mock-apollo/index.ts` |
| Outbound campaigns | Draft/steps/approval/enrollment/pause/resume/retry; suppression checks and idempotency mechanisms | `src/server/campaigns/*`, `src/app/(dashboard)/app/[tenantSlug]/campaigns/*` |
| CRM pipeline | Opportunities, stages, notes, tasks, owners, detail and list/board views | `src/server/crm/pipeline.ts`, `src/app/(dashboard)/app/[tenantSlug]/pipeline/*` |
| Apollo live integration | **Intentionally disabled and not implemented**; separate account per tenant and written vendor authorization required | `src/server/providers/apollo/index.ts`, `docs/apollo-integration-gates.md` |
| Credentials | Tenant/connection-bound mock refs; Vault reader is an optional future dependency, not live-enabled | `src/server/providers/credentials.ts` |
| Team management | Team page exists; invite/role change/removal actions remain unchecked | `docs/checklist.md`, `src/app/(dashboard)/app/[tenantSlug]/settings/team/page.tsx` |
| Background jobs | `jobs` and `sync_jobs` tables exist; operational runner/reconciliation remains unchecked | `docs/checklist.md`, `docs/architecture.md` |
| Automated testing | Vitest unit/integration, DB/RLS isolation, Playwright E2E source files exist | `tests/*`, `src/server/**/*.test.ts`, `package.json` |
| Marketing expansion | Website, SEO, paid ads and cross-channel analytics explicitly deferred | `docs/checklist.md`, `CLAUDE.md` |

### What is already designed well

- CRM data belongs to Commonbase Postgres, not Apollo; provider interfaces are replaceable.
- Multiple isolation layers: tenant membership, RLS, composite FKs, server-side authorization, and tests.
- Live Apollo remains blocked until contractual/API checks are complete. Preserve this safeguard.
- Campaign enrollment includes approval, suppression, idempotency and reconciliation concepts. Reuse the *patterns*, not the outbound-specific implementation, for future ad approval.
- The overview prioritizes qualified conversations, quote requests and won deals, which are better BRS business outcomes than vanity marketing metrics.

### Gaps and risks to investigate before expanding

1. **No completed background runner:** existing queue/sync tables alone do not make recurring synchronization, retries, dead-letter handling, or provider reconciliation operational.
2. **No live external data:** mock Apollo and synthetic seed data make the UI useful for demoing but not evidence of production readiness.
3. **No marketing source-of-truth model yet:** existing `opportunities.source_campaign_id` is outbound-campaign-specific and insufficient for multi-touch website/SEO/ads attribution. Avoid overloading it.
4. **Team administration unfinished:** access management is an operational requirement for multiple client organizations.
5. **Metrics scalability:** `src/server/crm/overview.ts` fetches opportunities/activities/contacts and computes metrics in application code. Confirm row counts, pagination, time filters and aggregation strategy before introducing high-volume web/ad events.
6. **Potential data-mode ambiguity:** overview derives `dataMode` from Apollo connection state. Future marketing sources can be live while Apollo is mocked; move toward per-source freshness and provenance instead of a single global mock/live badge.
7. **Paid media is not implemented:** campaign code currently means outbound email campaigns. Keep paid-ad campaigns in separate modules and tables to avoid conflating approval and spend semantics.
8. **Operational proof remains outstanding:** source tests exist, but this review did not run `typecheck`, `lint`, `test`, `test:db`, `test:e2e` or inspect deployed environments.

## 3. Instructions to Claude Code: start here

You are working in the checked-out repository at the branch above. **Do not rebuild the app or replace its architecture.** Read `CLAUDE.md`, `README.md`, `docs/architecture.md`, `docs/data-model.md`, `docs/checklist.md`, `docs/apollo-integration-gates.md`, all SQL migrations, and relevant services before making changes.

### Step A: verify actual baseline

1. Record branch and HEAD SHA; compare to the reviewed tree SHA. If changed, review diffs first.
2. Run `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`. If Docker/Postgres available, run `npm run test:db`; then `npm run test:e2e` following README setup. Record precise results and environment limitations. Do not report unrun tests as passing.
3. Inspect role matrix, service-role paths, auth redirect/middleware (`src/proxy.ts`), SQL grants, migrations, and provider registry. Identify real security issues only with exact file/line evidence.
4. Inspect TODOs and incomplete flows in `docs/checklist.md` against actual code. The checklist is an assertion, not a substitute for verification.
5. Create/update `docs/CURRENT_STATE_AUDIT.md` with working, partial, missing, blockers, test results, and specific file references.
6. Create/update `docs/IMPLEMENTATION_PLAN.md` with phased work, migrations, routes, tests and acceptance criteria. Update docs/checklist as implementation progresses.

### Step B: finish current MVP before scope expansion

**Priority 0: operational hardening**

- Implement Postgres-backed job runner using existing `jobs` and `sync_jobs` schema, with tenant-scoped job claims, bounded retries, backoff, idempotency, lease expiry, reconciliation and observable failure states. Avoid accidental real sending.
- Add integration status/failure visibility, safe manual retry, and tests for concurrency, crash recovery, cross-tenant access and suppressed recipients.
- Implement tenant-admin team actions (invite, role update, remove), audited, with safeguards against self-lockout and last-admin removal. Align with current RLS and role model.
- Check pagination and query limits for overview/prospect/campaign screens; ensure larger datasets do not silently truncate KPIs.
- Add operational health checks and deployment/backup guidance as appropriate; never expose service-role credentials.

**Priority 1: shared attribution foundation**

Create a marketing domain that augments, rather than replaces, current CRM:

- `marketing_sources` / `marketing_connections`: per-tenant provider identity, permission scopes, connection status, sync cursor/freshness; credentials server-only.
- `lead_inbound_events`: immutable first-party submissions, source type, source ID, landing page, referrer, UTMs (`utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`), `gclid`/`msclkid` when permitted, event timestamp, deduplication key and consent metadata. Minimize personal data in event payloads.
- `lead_attribution`: explicit contact/opportunity mapping and chosen attribution model. Start with first-touch and last-touch, retain raw touchpoints for later models. Record unknown/unattributed rather than inventing a channel.
- `marketing_campaigns`: provider-neutral marketing campaign identity, separate from outbound `campaigns`; links to channel/platform and optionally CRM outcomes.
- `marketing_daily_metrics`: tenant, provider, external entity, date, metric definitions, currency, ingestion timestamp, dedupe/upsert key; no mixing of estimated and confirmed conversion events.
- `quote_requests`: either a distinct entity or a documented, reliable event derived from existing opportunity milestones; avoid double-counting.

For every new tenant-owned table, use the conventions in `docs/data-model.md`: tenant ID, composite FKs, RLS, grants, audit where needed, and cross-tenant tests. Avoid premature generic event-sourcing infrastructure.

**Priority 2: website and lead ingestion (first user-visible marketing feature)**

- Build a tenant-specific `/settings/website` integration/configuration page and a `/marketing/leads` source breakdown.
- First support **connecting an existing website** with embeddable/hosted forms or a securely authenticated server-to-server ingestion endpoint. Do not attempt to build a full CMS first.
- Public form endpoint must identify a valid published form/tenant by an opaque token, validate fields, rate-limit and spam-protect, prevent cross-tenant injection, and implement idempotent ingestion. Do not treat public tenant IDs as authorization.
- Create/update contact and company records using existing dedupe rules; create inbound event with page/UTM/referrer attribution; optionally create a task or opportunity according to tenant configuration.
- Add a BRS-specific demo: website quote request -> contact/company -> attributed source -> quote-request milestone -> pipeline -> won deal. Use synthetic data only.
- Add simple uptime/health monitoring as a separate job after the runner exists. Site editing/CMS integrations come later and must honor publishing approvals and rollback.

**Priority 3: SEO tracking, read-only**

- Start with per-tenant Google Search Console and GA4 connections only after verifying official auth/API docs and required permissions. Clearly distinguish GSC search clicks/impressions/CTR/average position from GA4 sessions/conversions.
- Add `seo_properties`, `seo_queries_daily`, `seo_pages_daily`, `seo_issues` or equivalent; define property, page canonicalization, country/device/search type, time zone and data retention.
- Show tracked keywords/pages, time-series trends, and source freshness. Rankings are sampled/aggregated, not an exact universal Google position. Avoid unsupported claims about indexing or technical errors.
- Technical checks: metadata, broken links, canonical/noindex, robots/sitemap, and optional PageSpeed API with bounded crawling and respectful rate limits.
- Relate organic sessions and form submissions to CRM outcomes via the attribution foundation.

**Priority 4: paid media, read-only first**

- Design provider adapters for Google Ads and Meta Ads (or whichever provider is justified by actual client demand), verifying current official scopes, account permissions, API limits and terms before implementation.
- Read-only connection and ingestion of campaigns, budgets, status, ad groups, creatives/metadata, spend, impressions, clicks, conversions and reporting periods. Normalize currencies/time zones, preserve raw provider IDs and provenance.
- Dashboard: spend, leads, qualified conversations, quote requests, won deals, CPL, cost per quote request, cost per won deal. Distinguish platform-attributed conversions from CRM-attributed outcomes; avoid asserting perfect identity resolution.

**Priority 5: paid media writes only after safety gates**

Do **not** enable launching, resuming, changing budgets, or other spend-affecting operations as part of read-only implementation. Before any future write:

1. Explicit authorized human approval for an immutable proposed change showing tenant, ad account, campaign, current/new settings, incremental spend exposure, currency and expiry.
2. Per-tenant and per-provider-account budget caps stored and enforced **server-side** at request, approval and execution time; never rely on UI validation.
3. Separate permissions for proposing vs approving; avoid self-approval where feasible; require fresh authentication for sensitive approvals.
4. Append-only audit record for proposal, approval/rejection, execution, provider response, and reconciliation.
5. Idempotent execution and provider-state re-read immediately before mutation; fail closed on stale state, missing cap, authorization, permission, or API ambiguity.
6. Kill switch, safe dry-run mode, tests for concurrent approvals, currency mismatch, overspend attempts, cross-tenant IDs and partial provider failure.
7. **No automatic optimization agent with spending authority** without a separately approved policy and controls.

## 4. Suggested navigation and UX evolution

Preserve existing Overview / Prospects / Campaigns / Pipeline / Settings. As marketing is implemented, consider:

- **Sales:** Overview, Prospects, Outbound, Pipeline
- **Marketing:** Performance, Leads & Attribution, Website, SEO, Paid Ads
- **Settings:** Team, Integrations, Approval Policies

Rename current `Campaigns` in UI to **Outbound Campaigns** when a distinct paid-ad campaigns area is introduced. Make all pages tenant-specific and show integration state, sync freshness and whether data is synthetic.

## 5. Success metrics for BRS pilot

Primary business KPIs: quote requests, qualified conversations, won deals, and revenue/value won. Secondary: leads by channel, lead-to-quote rate, quote-to-win rate, organic impressions/clicks, website conversions, ad spend, cost per qualified lead, cost per quote and cost per won deal. Support period/channel/campaign filters and exportable definitions. Make source attribution transparent, including 'unknown'.

## 6. Definition of done for first implementation PR

- Baseline commands executed and results documented; no unexplained regressions.
- `docs/CURRENT_STATE_AUDIT.md` and `docs/IMPLEMENTATION_PLAN.md` reflect real code.
- One tightly scoped production-quality increment, preferably the job runner **or** team-management actions, with tests, migrations if required, and an explicit manual verification checklist.
- Existing mock Apollo safety and all tenant isolation controls preserved.
- A follow-on, migration-level plan for attributed website form intake with routes, schema and tests, but **do not start all integrations in one PR**.
- Report files changed, test outcomes, unresolved blockers and recommended next PR.

## 7. Guardrails

- Never claim Apollo licensing is approved or implement live sending without the documented written approval and per-tenant gates.
- Never turn a mock/synthetic dashboard into a purported real performance report.
- Never use service-role credentials in browser code; keep provider credentials encrypted and tenant-bound.
- Never weaken RLS or cross-tenant tests for convenience.
- Do not modify the existing outbound campaign state machine to model ad spend approvals.
- Avoid implementing a full CMS, ad writer and SEO crawler simultaneously. Deliver vertical slices with measurable outcomes.

---

**Review limits:** GitHub source files and documentation were inspected remotely. The code was not cloned or executed here, so runtime behavior, deployment configuration, API availability and green test status are not independently verified. Claude Code must verify these in its own environment before coding.
