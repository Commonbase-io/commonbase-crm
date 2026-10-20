-- Suppression list. Stores hashes of normalized emails and domains, never raw values.
-- Checked at enrollment time (application service and the campaign_contacts trigger),
-- not only when prospects are saved.

create table public.suppression_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  scope text not null check (scope in ('email', 'domain')),
  value_hash text not null check (value_hash ~ '^[0-9a-f]{64}$'),
  reason text not null default 'unspecified',
  source text not null check (source in ('manual', 'provider_opt_out', 'bounce', 'complaint', 'import', 'customer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, scope, value_hash)
);

create trigger suppression_entries_set_updated_at before update on public.suppression_entries
  for each row execute function app.set_updated_at();

-- True when the email, or its domain, is suppressed for the tenant.
create or replace function app.is_suppressed(p_tenant_id uuid, p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_email is null
    or exists (
      select 1 from public.suppression_entries s
      where s.tenant_id = p_tenant_id
        and (
          (s.scope = 'email' and s.value_hash = app.suppression_hash(p_email))
          or (s.scope = 'domain' and s.value_hash = app.suppression_hash(split_part(btrim(p_email), '@', 2)))
        )
    );
$$;
