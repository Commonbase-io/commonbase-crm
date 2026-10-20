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
  - [ ] Campaigns: list, draft editor, steps, mailbox, approval, enrollment with idempotency, pause
  - [x] Pipeline: board and table views, owner filter, stage moves with required lost reason, create, reassign, detail page with notes, tasks, and contact activity
  - [ ] Team management actions (invite, change role, remove), audit logged
- [~] 7. Tests
  - [x] RLS cross-tenant reads and writes, role rules, credential column, composite FKs
  - [x] Credential isolation in the provider registry
  - [x] DB-level suppression and campaign safety
  - [x] E2E smoke (login, tenant 404, role gating, integrations, staff chooser)
  - [x] E2E prospects (search, save with enrichment, dedupe, role gating, trigger filter)
  - [x] E2E pipeline (stage moves, lost reason, rep ownership, table and filters, create, notes, tasks, contact/company mismatch, cross-tenant id)
  - [ ] Service-level enrollment idempotency and retry tests
- [ ] 8. Postgres job runner: simulated activity sync, opt-out sync into suppression, reconciliation; failures visible on Integrations
- [x] 9. Environment variables, setup, tests, deployment (README)

## Phase B: live Apollo (blocked)

- [ ] 10. Only after explicit confirmation: implement the real adapter (`apollo-integration-gates.md`)

## Deferred until tenant #2 signs

- In-app workspace switcher (a simple chooser exists at `/app`)
- Audited Commonbase support-access flow (staff use explicit memberships for now)
- Trigger.dev
- Self-serve onboarding
