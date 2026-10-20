# Phased checklist

## Phase A: mock provider

- [x] 1. Inspect repo (empty), scaffold Next.js, TypeScript strict, Tailwind
- [x] 2. Docs: architecture, data model, Apollo gates, provisioning runbook, this checklist
- [x] 3. Design tokens, base UI components, responsive tenant-aware shell
- [x] 4. Schema, migrations, auth, memberships, RLS (reads and writes), composite FKs, DB-level campaign safety
- [x] 5. Seed: BRS plus a second synthetic tenant, each with its own mock Apollo connection
- [~] 6. Pages on the mock provider
  - [x] Overview (KPIs, quote-to-win, median days to quote, funnel, date and campaign filters, Demo data label)
  - [x] Settings: general, team (read-only), integrations (status, holder, billing, authorization, mailboxes, sync)
  - [x] Prospects: search via registry, trigger-event ranking, review, dedupe, save, optional enrichment, suppression and customer exclusion
  - [x] Campaigns: list, draft editor, steps (add, edit, reorder, delete), mailbox, compliance panel, approval, back to draft, enrollment with opt-out sync and idempotency, pause, resume, complete, retry pending
  - [x] Pipeline: board and table views, owner filter, stage moves with required lost reason, create, reassign, detail page with notes, tasks, and contact activity
  - [ ] Team management actions (invite, change role, remove), audit logged
- [~] 7. Tests
  - [x] RLS cross-tenant reads and writes, role rules, credential column, composite FKs
  - [x] Credential isolation in the provider registry
  - [x] DB-level suppression and campaign safety
  - [x] E2E smoke (login, tenant 404, role gating, integrations, staff chooser)
  - [x] E2E prospects (search, save with enrichment, dedupe, role gating, trigger filter)
  - [x] E2E pipeline (stage moves, lost reason, rep ownership, table and filters, create, notes, tasks, contact/company mismatch, cross-tenant id)
  - [x] Enrollment plan, state machine, and idempotency unit tests
  - [x] Job runner unit tests (retries, dead letters, tenant scoping, time budget) and DB tests (dedupe, SKIP LOCKED, stale locks, server-only)
  - [x] E2E jobs (cron auth, scheduled run, Sync now, activity reaches the overview)
  - [x] E2E campaigns (compliance gate, create to enroll, suppressed skips, back to draft, pause and resume, rep gating, cross-tenant id)
- [x] 8. Postgres job runner: scheduled opt-out sync, email activity sync (bounces suppressed), enrollment reconciliation, retries with backoff, failures and "Sync now" on Integrations
- [x] 9. Environment variables, setup, tests, deployment (README)

## Phase B: live Apollo (blocked)

- [ ] 10. Only after explicit confirmation: implement the real adapter (`apollo-integration-gates.md`)

## Phase C: digital marketing dashboard (planned, not scheduled)

Scope and rules are in `CLAUDE.md` under "Planned: digital marketing dashboard". Do not start until it is explicitly scheduled.

- [ ] Website management (pages, landing pages, forms that create attributed leads, health)
- [ ] SEO tracking (keywords, rankings, impressions, clicks, CTR, technical issues)
- [ ] Paid ad campaigns (read-only first; spend changes need approval, budget caps, audit log)
- [ ] Marketing analytics (leads by source, website impressions and clicks, social interactions, tied to pipeline outcomes)

## Deferred until tenant #2 signs

- In-app workspace switcher (a simple chooser exists at `/app`)
- Audited Commonbase support-access flow (staff use explicit memberships for now)
- Trigger.dev
- Self-serve onboarding
