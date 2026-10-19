# Commonbase CRM

Multi-tenant CRM. Work on `jake-dev`. Promote to `main` only with `npm run promote` after CI is green. Do not add other agent config.

## Risk classes

- R0: copy, docs, and styles that do not change data access.
- R1: UI behavior that still goes through the existing API checks.
- R2: tenant records, import, search, or audit behavior.
- R3: auth, sessions, roles, RLS, platform org creation, or migrations.

R3 changes need an integration test that fails if the check is removed.

## RLS

- The app connects as `crm_app` (`DATABASE_URL`). That role is not a superuser and does not bypass RLS.
- Every tenant read or write goes through `withOrg(orgId, userId, tx => ...)`, which sets the transaction-local org and user.
- Tenant tables have `orgId`. RLS is enabled and forced. Composite foreign keys include `orgId` so a row cannot point at another org.
- `Session` and `LoginAttempt` have no app policies. Cross-tenant reads use `SECURITY DEFINER` functions owned by `crm_definer` (NOLOGIN, BYPASSRLS).
- Roles, grants, and ownership live in `prisma/app-role.sql` and `prisma/rls-bootstrap.sql`, and those files are included in the migration.
- Authorization denials return 404. A missing record and a forbidden record look the same.

## Tests

- `npm run typecheck`, `npm run lint`, `npm run test:unit`, and `npm run test:integration` must pass.
- Integration tests use Postgres. Do not mock the database for tenancy, auth, or import.
- `npm run test:e2e` is the browser happy path. Playwright must keep `reuseExistingServer: false`.
