-- Idempotency keys, background jobs, provider sync state, audit log.

create table public.idempotency_keys (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  key text not null check (length(key) between 8 and 200),
  operation text not null,
  -- Hash of the request payload; reusing a key with a different payload is rejected.
  request_hash text not null,
  status text not null default 'in_progress' check (status in ('in_progress', 'completed', 'failed')),
  response jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, key)
);

create trigger idempotency_keys_set_updated_at before update on public.idempotency_keys
  for each row execute function app.set_updated_at();

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  type text not null check (type ~ '^[a-z][a-z0-9_.]{1,63}$'),
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'dead')),
  payload jsonb not null default '{}'::jsonb,
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts >= 1),
  run_after timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id)
);

create index jobs_runnable_idx on public.jobs (run_after) where status = 'queued';
create index jobs_tenant_status_idx on public.jobs (tenant_id, status);

create trigger jobs_set_updated_at before update on public.jobs
  for each row execute function app.set_updated_at();

create table public.sync_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  provider_connection_id uuid not null,
  kind text not null check (kind in ('opt_outs', 'email_activity', 'mailboxes')),
  status text not null default 'idle' check (status in ('idle', 'running', 'succeeded', 'failed')),
  cursor text,
  last_success_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, provider_connection_id, kind),
  foreign key (tenant_id, provider_connection_id)
    references public.provider_connections (tenant_id, id) on delete cascade
);

create trigger sync_jobs_set_updated_at before update on public.sync_jobs
  for each row execute function app.set_updated_at();

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null check (action ~ '^[a-z][a-z0-9_.]{1,63}$'),
  -- Never put raw emails, names, or tokens here; callers pass redacted metadata.
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index audit_logs_tenant_created_idx on public.audit_logs (tenant_id, created_at desc);

-- Append only, for every role including the service role. Deleting a tenant
-- cascades through the FK, which runs as a system action and is allowed below.
create or replace function app.audit_logs_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  raise exception 'audit_logs is append only' using errcode = 'insufficient_privilege';
end;
$$;

create trigger audit_logs_no_update before update on public.audit_logs
  for each row execute function app.audit_logs_append_only();
create trigger audit_logs_no_delete before delete on public.audit_logs
  for each row execute function app.audit_logs_append_only();
