-- Campaigns, sequence steps, enrollments, and activity events.
--
-- Campaign safety is enforced twice: by application services (which produce
-- useful errors) and by the triggers below (which hold even if a service has a
-- bug or someone writes with the service role).

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  provider_connection_id uuid not null,
  mailbox_id uuid,
  external_id text,
  name text not null check (length(btrim(name)) > 0),
  status text not null default 'draft'
    check (status in ('draft', 'approved', 'enrolling', 'active', 'paused', 'completed', 'failed')),
  -- Users who approved campaigns are deactivated (membership removed), not deleted,
  -- so the approval record survives.
  approved_by uuid references public.profiles (id),
  approved_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, provider_connection_id)
    references public.provider_connections (tenant_id, id),
  -- The mailbox must belong to the campaign's own connection (and so its own tenant).
  foreign key (tenant_id, provider_connection_id, mailbox_id)
    references public.mailboxes (tenant_id, provider_connection_id, id),
  constraint campaigns_non_draft_requires_approval check (
    status = 'draft' or (approved_by is not null and approved_at is not null and mailbox_id is not null)
  )
);

create index campaigns_tenant_status_idx on public.campaigns (tenant_id, status);

create trigger campaigns_set_updated_at before update on public.campaigns
  for each row execute function app.set_updated_at();

create table public.sequence_steps (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  campaign_id uuid not null,
  position integer not null check (position >= 1),
  step_type text not null default 'email' check (step_type in ('email', 'task')),
  delay_days integer not null default 0 check (delay_days between 0 and 365),
  subject text,
  body text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, campaign_id, position),
  foreign key (tenant_id, campaign_id) references public.campaigns (tenant_id, id) on delete cascade,
  constraint sequence_steps_email_has_subject check (step_type <> 'email' or length(btrim(coalesce(subject, ''))) > 0)
);

create trigger sequence_steps_set_updated_at before update on public.sequence_steps
  for each row execute function app.set_updated_at();

create table public.campaign_contacts (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  campaign_id uuid not null,
  contact_id uuid not null,
  enrollment_status text not null default 'pending'
    check (enrollment_status in ('pending', 'enrolling', 'enrolled', 'failed', 'removed', 'suppressed')),
  enrolled_at timestamptz,
  external_ref text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, campaign_id, contact_id),
  foreign key (tenant_id, campaign_id) references public.campaigns (tenant_id, id) on delete cascade,
  foreign key (tenant_id, contact_id) references public.contacts (tenant_id, id) on delete cascade
);

create index campaign_contacts_contact_idx on public.campaign_contacts (tenant_id, contact_id);

create trigger campaign_contacts_set_updated_at before update on public.campaign_contacts
  for each row execute function app.set_updated_at();

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  contact_id uuid not null,
  campaign_id uuid,
  event_type text not null check (event_type in (
    'email_sent', 'email_replied', 'positive_reply', 'email_bounced', 'opted_out',
    'meeting_booked', 'call_logged', 'note_logged'
  )),
  occurred_at timestamptz not null,
  external_event_id text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, contact_id) references public.contacts (tenant_id, id) on delete cascade,
  foreign key (tenant_id, campaign_id) references public.campaigns (tenant_id, id) on delete set null (campaign_id)
);

-- Provider events are idempotent by their external id.
create unique index activities_tenant_external_event_key on public.activities (tenant_id, external_event_id)
  where external_event_id is not null;
create index activities_tenant_occurred_idx on public.activities (tenant_id, occurred_at desc);
create index activities_tenant_contact_idx on public.activities (tenant_id, contact_id, occurred_at);

create trigger activities_set_updated_at before update on public.activities
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- Campaign state machine and approval gate
-- ---------------------------------------------------------------------------

-- Returns null when the campaign passes the compliance gate, otherwise a reason.
create or replace function app.campaign_compliance_problem(p_tenant_id uuid, p_campaign_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_address text;
  v_email_steps integer;
  v_bad_steps integer;
begin
  select postal_address into v_address from public.tenants where id = p_tenant_id;
  if v_address is null or length(btrim(v_address)) = 0 then
    return 'tenant has no sender postal address';
  end if;

  select count(*),
         count(*) filter (
           where position('{{unsubscribe_url}}' in s.body) = 0
              or position('{{sender_postal_address}}' in s.body) = 0
         )
    into v_email_steps, v_bad_steps
  from public.sequence_steps s
  where s.tenant_id = p_tenant_id and s.campaign_id = p_campaign_id and s.step_type = 'email';

  if v_email_steps = 0 then
    return 'campaign has no email steps';
  end if;
  if v_bad_steps > 0 then
    return 'every email step must include {{unsubscribe_url}} and {{sender_postal_address}}';
  end if;
  return null;
end;
$$;

create or replace function app.enforce_campaign_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_problem text;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception 'campaigns must be created as draft' using errcode = 'check_violation';
    end if;
    return new;
  end if;

  if new.tenant_id <> old.tenant_id or new.provider_connection_id <> old.provider_connection_id then
    raise exception 'campaign tenant and connection are immutable' using errcode = 'check_violation';
  end if;

  if new.status = old.status then
    return new;
  end if;

  if not (
    (old.status = 'draft' and new.status = 'approved')
    or (old.status = 'approved' and new.status in ('draft', 'enrolling'))
    or (old.status = 'enrolling' and new.status in ('active', 'failed'))
    or (old.status = 'active' and new.status in ('paused', 'completed', 'failed'))
    or (old.status = 'paused' and new.status in ('active', 'completed'))
    or (old.status = 'failed' and new.status in ('draft', 'enrolling'))
  ) then
    raise exception 'invalid campaign transition % -> %', old.status, new.status using errcode = 'check_violation';
  end if;

  if new.status = 'draft' then
    -- Returning to draft clears the approval; edits require a fresh approval.
    new.approved_by := null;
    new.approved_at := null;
  end if;

  if new.status in ('approved', 'enrolling', 'active') then
    v_problem := app.campaign_compliance_problem(new.tenant_id, new.id);
    if v_problem is not null then
      raise exception 'campaign failed compliance check: %', v_problem using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

create trigger campaigns_enforce_transition before insert or update on public.campaigns
  for each row execute function app.enforce_campaign_transition();

-- Steps are frozen once a campaign leaves draft.
create or replace function app.enforce_steps_editable()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_status text;
  v_row public.sequence_steps;
begin
  v_row := case when tg_op = 'DELETE' then old else new end;
  select status into v_status from public.campaigns
  where tenant_id = v_row.tenant_id and id = v_row.campaign_id;
  -- Parent already gone (cascade delete): nothing to protect.
  if v_status is null then
    return v_row;
  end if;
  if v_status <> 'draft' then
    raise exception 'sequence steps can only change while the campaign is a draft' using errcode = 'check_violation';
  end if;
  return v_row;
end;
$$;

create trigger sequence_steps_enforce_editable before insert or update or delete on public.sequence_steps
  for each row execute function app.enforce_steps_editable();

-- Enrollment gate: approved campaign, contact has an email, and nothing suppressed.
create or replace function app.enforce_enrollment_allowed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign_status text;
  v_email text;
begin
  if new.enrollment_status not in ('enrolling', 'enrolled') then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.enrollment_status = new.enrollment_status then
    return new;
  end if;

  select status into v_campaign_status from public.campaigns
  where tenant_id = new.tenant_id and id = new.campaign_id;
  if v_campaign_status not in ('approved', 'enrolling', 'active') then
    raise exception 'cannot enroll into a campaign in status %', v_campaign_status using errcode = 'check_violation';
  end if;

  select email into v_email from public.contacts
  where tenant_id = new.tenant_id and id = new.contact_id;
  if app.is_suppressed(new.tenant_id, v_email) then
    raise exception 'contact is suppressed or has no email' using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger campaign_contacts_enforce_enrollment before insert or update on public.campaign_contacts
  for each row execute function app.enforce_enrollment_allowed();
