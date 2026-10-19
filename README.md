# commonbase-crm

A small multi-tenant CRM for Commonbase clients.

Local run: `docker compose up -d`, copy `.env.example` to `.env`, then `npm run db:setup`, `npm run db:seed`, and `npm run dev`. The app connects as `crm_app`. Seed passwords are `Password1` and exist only for a throwaway local database.
