-- Team management: last-admin protection and server-only account lookups.

-- A tenant must always keep at least one tenant_admin, so an admin can never
-- be locked out by a demotion or removal, whichever role makes the change.
-- (Members already cannot change or remove their own membership; see RLS.)
-- Deleting the tenant itself still cascades: by then the tenant row is gone.
create or replace function app.ensure_tenant_keeps_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role <> 'tenant_admin' then
    return null;
  end if;
  if tg_op = 'UPDATE' and new.role = 'tenant_admin' then
    return null;
  end if;
  if not exists (select 1 from public.tenants where id = old.tenant_id) then
    return null;
  end if;
  if not exists (
    select 1 from public.memberships
    where tenant_id = old.tenant_id and role = 'tenant_admin'
  ) then
    raise exception 'a workspace must keep at least one admin' using errcode = 'check_violation';
  end if;
  return null;
end;
$$;

create trigger memberships_keep_admin
  after update of role or delete on public.memberships
  for each row execute function app.ensure_tenant_keeps_admin();

-- Existing Supabase Auth account for an email, if any. Used when an admin
-- adds someone who already has an account (no invite email needed).
create or replace function public.find_auth_user_id(p_email text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from auth.users where lower(email) = lower(btrim(p_email)) limit 1;
$$;

-- Email and sign-in state for a tenant's members, for the admin Team page.
-- Only members of p_tenant_id are returned.
create or replace function public.tenant_member_accounts(p_tenant_id uuid)
returns table (user_id uuid, email text, last_sign_in_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.email::text, u.last_sign_in_at
  from public.memberships m
  join auth.users u on u.id = m.user_id
  where m.tenant_id = p_tenant_id;
$$;

revoke all on function public.find_auth_user_id(text) from public, anon, authenticated;
revoke all on function public.tenant_member_accounts(uuid) from public, anon, authenticated;
grant execute on function public.find_auth_user_id(text) to service_role;
grant execute on function public.tenant_member_accounts(uuid) to service_role;
