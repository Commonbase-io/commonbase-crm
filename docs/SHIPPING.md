# Shipping

Work happens on `jake-dev`. CI runs typecheck, lint, unit tests, and integration tests against Postgres 16 on every push to `jake-dev` and `main`. There is no deploy job.

When CI is green on the commit you want to ship:

```bash
npm run promote
```

That fast-forwards `main` to `jake-dev` and pushes `main`. Do not commit to `main` directly.

## Risk classes

- R0 docs and visual tweaks can go out with the normal promote.
- R1 UI changes still need the happy path if a form or list changed.
- R2 import, search, audit, or record rules need the matching integration test.
- R3 auth, RLS, roles, or migrations need the tenancy and auth tests, and a second person to read the SQL before promote.

## RLS

Migrations create `crm_owner` (owns tables, no login, no bypass), `crm_definer` (owns definer functions, no login, bypasses RLS), and `crm_app` (the app login, no bypass). The password in `prisma/app-role.sql` is a local and CI placeholder. Set a real `crm_app` password outside git before any hosted database is used, and point `DATABASE_URL` at `crm_app` only.

`withOrg` is the only way application code reads or writes tenant tables. New tenant tables need `orgId`, forced RLS, grants, and a composite foreign key when they reference another tenant row.

## Tests

CI does not start the Next.js server. Run `npm run test:e2e` locally before promoting a UI change. Integration tests truncate the database they are pointed at, so they must use a throwaway database.
