-- Postgres-backed job queue: dedupe, atomic claiming, stale-lock recovery.
-- Only the service role (server-side runner) can enqueue or claim jobs.

alter table public.jobs add column dedupe_key text;

-- At most one queued or running job per (tenant, dedupe_key), so recurring
-- schedules and repeated "run now" clicks never stack duplicate work.
create unique index jobs_tenant_dedupe_active_key on public.jobs (tenant_id, dedupe_key)
  where dedupe_key is not null and status in ('queued', 'running');

-- Returns the new job id, or null when an equivalent job is already queued or running.
create or replace function public.enqueue_job(
  p_tenant_id uuid,
  p_type text,
  p_payload jsonb default '{}'::jsonb,
  p_dedupe_key text default null,
  p_run_after timestamptz default now()
)
returns uuid
language sql
volatile
set search_path = ''
as $$
  insert into public.jobs (tenant_id, type, payload, dedupe_key, run_after)
  values (p_tenant_id, p_type, coalesce(p_payload, '{}'::jsonb), p_dedupe_key, coalesce(p_run_after, now()))
  on conflict (tenant_id, dedupe_key) where dedupe_key is not null and status in ('queued', 'running')
  do nothing
  returning id;
$$;

-- Atomically claims up to p_limit runnable jobs for one worker. A job is
-- runnable when queued and due, or when "running" with a lock older than
-- p_stale_after (its worker died). SKIP LOCKED lets several workers run safely.
-- Optional p_tenant_id restricts claiming to one tenant ("run now" for a tenant).
create or replace function public.claim_jobs(
  p_worker text,
  p_limit integer default 10,
  p_stale_after interval default interval '10 minutes',
  p_tenant_id uuid default null
)
returns setof public.jobs
language sql
volatile
set search_path = ''
as $$
  update public.jobs j
     set status = 'running',
         attempts = j.attempts + 1,
         locked_at = now(),
         locked_by = p_worker
   where j.id in (
     select c.id
       from public.jobs c
      where (p_tenant_id is null or c.tenant_id = p_tenant_id)
        and (
          (c.status = 'queued' and c.run_after <= now())
          or (c.status = 'running' and c.locked_at < now() - p_stale_after)
        )
      order by c.run_after
      limit greatest(1, least(p_limit, 100))
      for update skip locked
   )
  returning j.*;
$$;

revoke all on function public.enqueue_job(uuid, text, jsonb, text, timestamptz) from public, anon, authenticated;
revoke all on function public.claim_jobs(text, integer, interval, uuid) from public, anon, authenticated;
grant execute on function public.enqueue_job(uuid, text, jsonb, text, timestamptz) to service_role;
grant execute on function public.claim_jobs(text, integer, interval, uuid) to service_role;
