-- Row level security and privileges.
--
-- Model:
--   * anon gets nothing.
--   * authenticated gets explicit table/column privileges, then RLS narrows rows
--     to tenants the user is a member of, with role checks on writes.
--   * service_role bypasses RLS. Server code using it must authorize explicitly
--     (src/server/auth) and is the only path for state transitions such as
--     campaign approval, enrollment, connection management, and audit writes.
--
-- Supabase grants broad default privileges on new public tables; this
-- migration revokes them and re-grants deliberately. Every new table needs the
-- same treatment (checklist in docs/data-model.md).

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema app from public;
grant usage on schema app to authenticated, service_role;
grant execute on all functions in schema app to authenticated, service_role;

grant all on all tables in schema public to service_role;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------

alter table public.tenants enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.provider_connections enable row level security;
alter table public.mailboxes enable row level security;
alter table public.companies enable row level security;
alter table public.company_trigger_events enable row level security;
alter table public.contacts enable row level security;
alter table public.suppression_entries enable row level security;
alter table public.campaigns enable row level security;
alter table public.sequence_steps enable row level security;
alter table public.campaign_contacts enable row level security;
alter table public.activities enable row level security;
alter table public.opportunities enable row level security;
alter table public.notes enable row level security;
alter table public.tasks enable row level security;
alter table public.idempotency_keys enable row level security;
alter table public.jobs enable row level security;
alter table public.sync_jobs enable row level security;
alter table public.audit_logs enable row level security;

-- ---------------------------------------------------------------------------
-- Tenants, profiles, memberships
-- ---------------------------------------------------------------------------

grant select on public.tenants to authenticated;
create policy tenants_select_member on public.tenants
  for select to authenticated using (app.is_member(id));

grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;
create policy profiles_select_self_or_teammate on public.profiles
  for select to authenticated using (id = auth.uid() or app.shares_tenant_with(id));
create policy profiles_update_self on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Only tenant_admin manages memberships, and nobody (admins included) can
-- change or remove their own membership. Only the role column is updatable,
-- so a membership can never be moved to another tenant or user.
grant select, insert, delete on public.memberships to authenticated;
grant update (role) on public.memberships to authenticated;
create policy memberships_select_member on public.memberships
  for select to authenticated using (app.is_member(tenant_id));
create policy memberships_insert_admin on public.memberships
  for insert to authenticated
  with check (app.has_role(tenant_id, array['tenant_admin']) and user_id <> auth.uid());
create policy memberships_update_admin on public.memberships
  for update to authenticated
  using (app.has_role(tenant_id, array['tenant_admin']) and user_id <> auth.uid())
  with check (app.has_role(tenant_id, array['tenant_admin']) and user_id <> auth.uid());
create policy memberships_delete_admin on public.memberships
  for delete to authenticated
  using (app.has_role(tenant_id, array['tenant_admin']) and user_id <> auth.uid());

-- ---------------------------------------------------------------------------
-- Provider connections and mailboxes: read-only for members, and never the
-- credential_ref column. All writes go through server code.
-- ---------------------------------------------------------------------------

grant select (
  id, tenant_id, provider, mode, external_account_id, account_holder, billing_party, plan_tier,
  authorization_confirmed_at, status, last_verified_at, last_error, created_at, updated_at
) on public.provider_connections to authenticated;
create policy provider_connections_select_member on public.provider_connections
  for select to authenticated using (app.is_member(tenant_id));

grant select on public.mailboxes to authenticated;
create policy mailboxes_select_member on public.mailboxes
  for select to authenticated using (app.is_member(tenant_id));

-- ---------------------------------------------------------------------------
-- CRM records: any member reads and writes; managers and admins delete.
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on public.companies to authenticated;
create policy companies_select on public.companies
  for select to authenticated using (app.is_member(tenant_id));
create policy companies_insert on public.companies
  for insert to authenticated with check (app.is_member(tenant_id));
create policy companies_update on public.companies
  for update to authenticated using (app.is_member(tenant_id)) with check (app.is_member(tenant_id));
create policy companies_delete on public.companies
  for delete to authenticated using (app.has_role(tenant_id, array['tenant_admin', 'sales_manager']));

grant select, insert, update, delete on public.company_trigger_events to authenticated;
create policy company_trigger_events_select on public.company_trigger_events
  for select to authenticated using (app.is_member(tenant_id));
create policy company_trigger_events_insert on public.company_trigger_events
  for insert to authenticated with check (app.is_member(tenant_id));
create policy company_trigger_events_update on public.company_trigger_events
  for update to authenticated using (app.is_member(tenant_id)) with check (app.is_member(tenant_id));
create policy company_trigger_events_delete on public.company_trigger_events
  for delete to authenticated using (app.has_role(tenant_id, array['tenant_admin', 'sales_manager']));

grant select, insert, update, delete on public.contacts to authenticated;
create policy contacts_select on public.contacts
  for select to authenticated using (app.is_member(tenant_id));
create policy contacts_insert on public.contacts
  for insert to authenticated with check (app.is_member(tenant_id));
create policy contacts_update on public.contacts
  for update to authenticated using (app.is_member(tenant_id)) with check (app.is_member(tenant_id));
create policy contacts_delete on public.contacts
  for delete to authenticated using (app.has_role(tenant_id, array['tenant_admin', 'sales_manager']));

-- Activities are an event log: members add (e.g. a logged call), nobody edits.
grant select, insert on public.activities to authenticated;
create policy activities_select on public.activities
  for select to authenticated using (app.is_member(tenant_id));
create policy activities_insert on public.activities
  for insert to authenticated
  with check (app.is_member(tenant_id) and external_event_id is null);

-- Reps edit only opportunities they own and cannot hand them to someone else;
-- managers and admins edit any.
grant select, insert, update, delete on public.opportunities to authenticated;
create policy opportunities_select on public.opportunities
  for select to authenticated using (app.is_member(tenant_id));
create policy opportunities_insert on public.opportunities
  for insert to authenticated
  with check (
    app.has_role(tenant_id, array['tenant_admin', 'sales_manager'])
    or (app.is_member(tenant_id) and owner_id = auth.uid())
  );
create policy opportunities_update on public.opportunities
  for update to authenticated
  using (
    app.has_role(tenant_id, array['tenant_admin', 'sales_manager'])
    or (app.is_member(tenant_id) and owner_id = auth.uid())
  )
  with check (
    app.has_role(tenant_id, array['tenant_admin', 'sales_manager'])
    or (app.is_member(tenant_id) and owner_id = auth.uid())
  );
create policy opportunities_delete on public.opportunities
  for delete to authenticated using (app.has_role(tenant_id, array['tenant_admin', 'sales_manager']));

grant select, insert, update, delete on public.notes to authenticated;
create policy notes_select on public.notes
  for select to authenticated using (app.is_member(tenant_id));
create policy notes_insert on public.notes
  for insert to authenticated with check (app.is_member(tenant_id) and author_id = auth.uid());
create policy notes_update on public.notes
  for update to authenticated
  using (app.is_member(tenant_id) and author_id = auth.uid())
  with check (app.is_member(tenant_id) and author_id = auth.uid());
create policy notes_delete on public.notes
  for delete to authenticated
  using (author_id = auth.uid() or app.has_role(tenant_id, array['tenant_admin']));

grant select, insert, update, delete on public.tasks to authenticated;
create policy tasks_select on public.tasks
  for select to authenticated using (app.is_member(tenant_id));
create policy tasks_insert on public.tasks
  for insert to authenticated with check (app.is_member(tenant_id));
create policy tasks_update on public.tasks
  for update to authenticated using (app.is_member(tenant_id)) with check (app.is_member(tenant_id));
create policy tasks_delete on public.tasks
  for delete to authenticated
  using (owner_id = auth.uid() or app.has_role(tenant_id, array['tenant_admin', 'sales_manager']));

-- ---------------------------------------------------------------------------
-- Campaigns: managers and admins edit drafts directly. Every status change
-- (approve, enroll, activate, pause) goes through server code, so the
-- authenticated role can only touch name and mailbox, and only on drafts.
-- ---------------------------------------------------------------------------

grant select, delete on public.campaigns to authenticated;
grant insert (tenant_id, provider_connection_id, mailbox_id, name) on public.campaigns to authenticated;
grant update (name, mailbox_id) on public.campaigns to authenticated;
create policy campaigns_select on public.campaigns
  for select to authenticated using (app.is_member(tenant_id));
create policy campaigns_insert_draft on public.campaigns
  for insert to authenticated
  with check (app.has_role(tenant_id, array['tenant_admin', 'sales_manager']) and status = 'draft');
create policy campaigns_update_draft on public.campaigns
  for update to authenticated
  using (app.has_role(tenant_id, array['tenant_admin', 'sales_manager']) and status = 'draft')
  with check (app.has_role(tenant_id, array['tenant_admin', 'sales_manager']) and status = 'draft');
create policy campaigns_delete_draft on public.campaigns
  for delete to authenticated
  using (app.has_role(tenant_id, array['tenant_admin', 'sales_manager']) and status = 'draft');

grant select, insert, update, delete on public.sequence_steps to authenticated;
create policy sequence_steps_select on public.sequence_steps
  for select to authenticated using (app.is_member(tenant_id));
create policy sequence_steps_insert on public.sequence_steps
  for insert to authenticated with check (app.has_role(tenant_id, array['tenant_admin', 'sales_manager']));
create policy sequence_steps_update on public.sequence_steps
  for update to authenticated
  using (app.has_role(tenant_id, array['tenant_admin', 'sales_manager']))
  with check (app.has_role(tenant_id, array['tenant_admin', 'sales_manager']));
create policy sequence_steps_delete on public.sequence_steps
  for delete to authenticated using (app.has_role(tenant_id, array['tenant_admin', 'sales_manager']));

-- Enrollment only through the server (approval + suppression + idempotency).
grant select on public.campaign_contacts to authenticated;
create policy campaign_contacts_select on public.campaign_contacts
  for select to authenticated using (app.is_member(tenant_id));

-- ---------------------------------------------------------------------------
-- Compliance and operations
-- ---------------------------------------------------------------------------

-- Anyone may add a suppression (always the safe direction); only admins remove.
grant select, insert, delete on public.suppression_entries to authenticated;
create policy suppression_entries_select on public.suppression_entries
  for select to authenticated using (app.is_member(tenant_id));
create policy suppression_entries_insert on public.suppression_entries
  for insert to authenticated with check (app.is_member(tenant_id));
create policy suppression_entries_delete on public.suppression_entries
  for delete to authenticated using (app.has_role(tenant_id, array['tenant_admin']));

-- idempotency_keys: no authenticated access at all (server only).

grant select on public.jobs to authenticated;
create policy jobs_select_managers on public.jobs
  for select to authenticated using (app.has_role(tenant_id, array['tenant_admin', 'sales_manager']));

grant select on public.sync_jobs to authenticated;
create policy sync_jobs_select_managers on public.sync_jobs
  for select to authenticated using (app.has_role(tenant_id, array['tenant_admin', 'sales_manager']));

grant select on public.audit_logs to authenticated;
create policy audit_logs_select_admin on public.audit_logs
  for select to authenticated using (app.has_role(tenant_id, array['tenant_admin']));
