-- Foundation: private helper schema, tenants, profiles, memberships.
--
-- Conventions used by every later migration:
--   * Every tenant-owned table carries tenant_id, created_at, updated_at.
--   * Every tenant-owned table declares unique (tenant_id, id) so children can use
--     composite foreign keys (tenant_id, <parent>_id) and can never point at
--     another tenant's row.
--   * Enumerations are text + check constraints so they can evolve without enum
--     migrations.

create schema if not exists app;
comment on schema app is 'Private helpers for RLS and triggers. Not exposed through the Data API.';

-- ---------------------------------------------------------------------------
-- Generic helpers
-- ---------------------------------------------------------------------------

create or replace function app.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Normalized value hash used by the suppression list, so the list never stores
-- raw emails. Must match src/server/compliance/suppression.ts.
create or replace function app.suppression_hash(p_value text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select encode(sha256(convert_to(lower(btrim(p_value)), 'UTF8')), 'hex');
$$;

-- ---------------------------------------------------------------------------
-- Tenants
-- ---------------------------------------------------------------------------

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 48),
  -- Sender postal address required in every outbound template (CAN-SPAM).
  postal_address text,
  -- Tenant-specific configuration (e.g. which trigger event types matter).
  -- Pilot-specific behavior lives here and in seed data, never in shared code.
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger tenants_set_updated_at before update on public.tenants
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- Profiles (one per Supabase Auth user)
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function app.set_updated_at();

create or replace function app.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1), ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function app.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- Memberships
-- ---------------------------------------------------------------------------

create table public.memberships (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('tenant_admin', 'sales_manager', 'sales_rep')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

create index memberships_user_id_idx on public.memberships (user_id);

create trigger memberships_set_updated_at before update on public.memberships
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- Authorization helpers for RLS.
-- SECURITY DEFINER so policies on memberships can call them without recursing
-- through memberships' own RLS. They only ever answer for auth.uid().
-- ---------------------------------------------------------------------------

create or replace function app.is_member(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.tenant_id = p_tenant_id and m.user_id = auth.uid()
  );
$$;

create or replace function app.has_role(p_tenant_id uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.tenant_id = p_tenant_id and m.user_id = auth.uid() and m.role = any (p_roles)
  );
$$;

-- True when both users share at least one tenant (used for profile visibility).
create or replace function app.shares_tenant_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships mine
    join public.memberships theirs on theirs.tenant_id = mine.tenant_id
    where mine.user_id = auth.uid() and theirs.user_id = p_user_id
  );
$$;
