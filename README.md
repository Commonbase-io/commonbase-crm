# Commonbase Sales OS

Multi-tenant B2B sales app: companies, contacts, opportunities, and outbound campaigns. Commonbase Postgres is the system of record. Apollo is a replaceable integration, and right now it runs **only as a mock**. See `CLAUDE.md` for the full brief and `docs/` for architecture, the data model, and the Apollo gates.

## Stack

Next.js 16 (App Router), React 19, TypeScript (strict), Tailwind CSS 4, Supabase (Postgres, Auth, RLS), Zod, Vitest, Playwright.

## Local setup

Requires Node 22+ and Docker.

```bash
npm install
npm run db:start            # local Supabase (DB, Auth, REST); applies migrations and seed
npx supabase status -o env  # copy API_URL, ANON_KEY, SERVICE_ROLE_KEY into .env.local
npm run dev
```

`.env.local`:

| Variable | Where | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | browser and server | Supabase API URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser and server | anon key; RLS applies |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | bypasses RLS; never prefix with `NEXT_PUBLIC_` |
| `APOLLO_LIVE_GATE` | server only | anything other than `approved` keeps live Apollo off. Leave it `locked`. |
| `CRON_SECRET` | server only | 32+ random characters; protects `/api/jobs/run` (background syncs) |

Seeded demo logins (password `demo-password-1`, all synthetic):

| Email | Access |
|---|---|
| `staff@commonbase.example` | admin in both tenants |
| `admin@brs-demo.example`, `manager@brs-demo.example`, `rep@brs-demo.example` | BRS (demo) |
| `admin@harbor-demo.example`, `rep@harbor-demo.example` | Harbor Facilities (demo) |

Auth emails (invites, password resets) go to the local Mailpit inbox at http://127.0.0.1:54324.

`npm run db:reset` re-applies migrations and seed. After a schema change, run `npm run db:types`.

Background syncs run on a schedule in production. Locally, either click **Sync now** on Settings → Integrations, or run:

```bash
curl -X POST http://localhost:3000/api/jobs/run -H "authorization: Bearer $CRON_SECRET"
```

## Checks

```bash
npm run typecheck
npm run lint
npm test             # unit and integration (no database)
npm run test:db      # migrations + RLS + isolation tests against a throwaway Postgres database
npm run test:e2e     # Playwright; needs db:start and npm run build
```

`test:db` runs against plain Postgres with a small Supabase shim (`supabase/tests/supabase-shim.sql`), so CI needs only a Postgres service. Point it at a server with `TEST_DATABASE_URL` (default `postgres://postgres:postgres@localhost:5432/postgres`; the user needs `CREATEDB`). All external calls are mocked; nothing sends email.

## Deployment (Vercel)

1. Create a Supabase project and run `npx supabase db push` to apply the migrations. **Don't run `seed.sql` in production.**
2. In the Supabase dashboard:
   - keep email/password sign-in on and public sign-ups off (tenants and users are provisioned by Commonbase)
   - set **Site URL** to the app's URL
   - configure custom SMTP (the built-in sender is heavily rate-limited)
   - copy the invite and recovery templates from `supabase/templates/` (their links go to `/auth/confirm`)
3. Set the env vars above in Vercel. `SUPABASE_SERVICE_ROLE_KEY` must not be exposed to the client.
4. `vercel.json` schedules `/api/jobs/run` every 15 minutes. Check your Vercel plan's cron limits; if it only allows daily runs, use an external scheduler that sends the same bearer header.
5. Leave `APOLLO_LIVE_GATE=locked` until every item in `docs/apollo-integration-gates.md` is done.

## Layout

```
src/app/(auth)/login                 sign in and sign out
src/app/(dashboard)/app/[tenantSlug] overview, prospects, campaigns, pipeline, settings/*
src/server/auth                      session, tenant context, role permissions
src/server/providers                 interfaces, per-tenant registry, credentials, mock-apollo, apollo (blocked)
src/server/compliance                suppression hashing, template compliance, redaction
supabase/migrations                  schema, triggers, RLS
supabase/seed.sql                    two synthetic tenants
tests/tenant-isolation               RLS and DB-level safety tests
tests/integrations                   provider registry and mock adapter tests
tests/e2e                            Playwright smoke tests
docs/                                architecture, data model, Apollo gates, provisioning runbook, checklist
```
