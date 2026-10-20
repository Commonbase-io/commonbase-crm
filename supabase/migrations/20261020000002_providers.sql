-- Provider connections and mailboxes.
--
-- Each tenant has its own dedicated Apollo account. At most one pending or
-- connected Apollo connection exists per tenant. Credentials are never stored
-- here: credential_ref points at a server-side secret and is not readable by
-- the authenticated role (see the RLS migration's column grants).

create table public.provider_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  provider text not null check (provider in ('apollo')),
  -- 'mock' uses the deterministic mock adapter; 'live' is gated (docs/apollo-integration-gates.md).
  mode text not null default 'mock' check (mode in ('mock', 'live')),
  external_account_id text,
  account_holder text not null check (account_holder in ('client', 'commonbase')),
  billing_party text not null check (billing_party in ('client', 'commonbase')),
  plan_tier text,
  -- Date the tenant's written authorization was received. Operational fact, not a secret.
  authorization_confirmed_at timestamptz,
  credential_ref text,
  status text not null default 'disconnected'
    check (status in ('disconnected', 'pending', 'connected', 'error', 'revoked')),
  last_verified_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  -- A live connection can only be connected with a credential and a recorded authorization.
  constraint provider_connections_live_requires_authorization check (
    mode <> 'live' or status <> 'connected'
    or (authorization_confirmed_at is not null and credential_ref is not null)
  ),
  -- Revoked connections must not keep a usable credential reference.
  constraint provider_connections_revoked_has_no_credential check (
    status <> 'revoked' or credential_ref is null
  )
);

create unique index provider_connections_one_active_per_tenant
  on public.provider_connections (tenant_id, provider)
  where status in ('pending', 'connected');

create trigger provider_connections_set_updated_at before update on public.provider_connections
  for each row execute function app.set_updated_at();

create table public.mailboxes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  provider_connection_id uuid not null,
  email text not null check (email = lower(btrim(email)) and position('@' in email) > 1),
  external_id text,
  status text not null default 'active' check (status in ('active', 'paused', 'disconnected')),
  daily_limit integer not null default 50 check (daily_limit between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  -- Lets campaigns require that their mailbox belongs to their own connection.
  unique (tenant_id, provider_connection_id, id),
  unique (tenant_id, provider_connection_id, email),
  foreign key (tenant_id, provider_connection_id)
    references public.provider_connections (tenant_id, id) on delete cascade
);

create trigger mailboxes_set_updated_at before update on public.mailboxes
  for each row execute function app.set_updated_at();
