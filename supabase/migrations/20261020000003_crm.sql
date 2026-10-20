-- Companies, trigger events, contacts.

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  -- Deduplication key for companies. Stored lowercase without scheme or www.
  domain text check (domain is null or (domain = lower(btrim(domain)) and domain !~ '^(https?://|www\.)' and domain !~ '/')),
  industry text,
  location text,
  employee_count integer check (employee_count is null or employee_count >= 0),
  is_customer boolean not null default false,
  source text not null default 'manual' check (source in ('manual', 'prospect_search', 'import', 'provider_sync')),
  external_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id)
);

create unique index companies_tenant_domain_key on public.companies (tenant_id, domain) where domain is not null;
create index companies_tenant_name_idx on public.companies (tenant_id, name);

create trigger companies_set_updated_at before update on public.companies
  for each row execute function app.set_updated_at();

create table public.company_trigger_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  company_id uuid not null,
  -- Free-form snake_case so tenants define their own event vocabulary in tenants.config.
  event_type text not null check (event_type ~ '^[a-z][a-z0-9_]{1,47}$'),
  event_date date,
  source text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, company_id) references public.companies (tenant_id, id) on delete cascade
);

create index company_trigger_events_company_idx on public.company_trigger_events (tenant_id, company_id, event_date desc);

create trigger company_trigger_events_set_updated_at before update on public.company_trigger_events
  for each row execute function app.set_updated_at();

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  company_id uuid,
  name text not null check (length(btrim(name)) > 0),
  title text,
  email text,
  -- Deduplication key for contacts. Generated so it can never drift from email.
  email_normalized text generated always as (lower(btrim(email))) stored,
  -- Search results never imply a verified address.
  email_status text not null default 'unverified' check (email_status in ('unverified', 'verified', 'invalid')),
  external_ref text,
  enrichment_status text not null default 'not_requested'
    check (enrichment_status in ('not_requested', 'pending', 'enriched', 'failed')),
  source text not null default 'manual' check (source in ('manual', 'prospect_search', 'import', 'provider_sync')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, company_id) references public.companies (tenant_id, id) on delete set null (company_id)
);

create unique index contacts_tenant_email_key on public.contacts (tenant_id, email_normalized) where email_normalized is not null;
create unique index contacts_tenant_external_ref_key on public.contacts (tenant_id, external_ref) where external_ref is not null;
create index contacts_tenant_company_idx on public.contacts (tenant_id, company_id);

create trigger contacts_set_updated_at before update on public.contacts
  for each row execute function app.set_updated_at();
