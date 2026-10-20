-- Opportunities, notes, tasks.

create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  company_id uuid not null,
  contact_id uuid,
  owner_id uuid,
  title text not null check (length(btrim(title)) > 0),
  stage text not null default 'new' check (stage in (
    'new', 'contacted', 'interested', 'qualified', 'quote_requested', 'proposal_sent', 'won', 'lost'
  )),
  estimated_value numeric(14, 2) check (estimated_value is null or estimated_value >= 0),
  source_campaign_id uuid,
  -- Stage milestones. Maintained by the trigger below so KPIs do not depend on
  -- every caller remembering to set them.
  first_touch_at timestamptz,
  qualified_at timestamptz,
  quote_requested_at timestamptz,
  closed_at timestamptz,
  lost_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, company_id) references public.companies (tenant_id, id),
  foreign key (tenant_id, contact_id) references public.contacts (tenant_id, id) on delete set null (contact_id),
  -- Owners must be members of the same tenant.
  foreign key (tenant_id, owner_id) references public.memberships (tenant_id, user_id) on delete set null (owner_id),
  foreign key (tenant_id, source_campaign_id) references public.campaigns (tenant_id, id) on delete set null (source_campaign_id),
  constraint opportunities_lost_requires_reason check (
    stage <> 'lost' or length(btrim(coalesce(lost_reason, ''))) > 0
  )
);

create index opportunities_tenant_stage_idx on public.opportunities (tenant_id, stage);
create index opportunities_tenant_owner_idx on public.opportunities (tenant_id, owner_id);

create trigger opportunities_set_updated_at before update on public.opportunities
  for each row execute function app.set_updated_at();

create or replace function app.maintain_opportunity_milestones()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_rank integer;
begin
  v_rank := array_position(
    array['new', 'contacted', 'interested', 'qualified', 'quote_requested', 'proposal_sent', 'won'],
    new.stage
  );

  if new.first_touch_at is null and v_rank >= 2 then
    new.first_touch_at := now();
  end if;
  if new.qualified_at is null and v_rank >= 4 then
    new.qualified_at := now();
  end if;
  if new.quote_requested_at is null and v_rank >= 5 then
    new.quote_requested_at := now();
  end if;

  if new.stage in ('won', 'lost') then
    new.closed_at := coalesce(new.closed_at, now());
  else
    new.closed_at := null;
  end if;
  if new.stage <> 'lost' then
    new.lost_reason := null;
  end if;
  return new;
end;
$$;

create trigger opportunities_maintain_milestones before insert or update on public.opportunities
  for each row execute function app.maintain_opportunity_milestones();

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  entity_type text not null check (entity_type in ('company', 'contact', 'opportunity')),
  entity_id uuid not null,
  author_id uuid,
  body text not null check (length(btrim(body)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, author_id) references public.memberships (tenant_id, user_id) on delete set null (author_id)
);

create index notes_entity_idx on public.notes (tenant_id, entity_type, entity_id);

create trigger notes_set_updated_at before update on public.notes
  for each row execute function app.set_updated_at();

-- notes.entity_id is polymorphic, so a composite FK is impossible; this trigger
-- gives the same guarantee: the target exists in the note's own tenant.
create or replace function app.enforce_note_entity_tenant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_found boolean;
begin
  v_found := case new.entity_type
    when 'company' then exists (select 1 from public.companies where tenant_id = new.tenant_id and id = new.entity_id)
    when 'contact' then exists (select 1 from public.contacts where tenant_id = new.tenant_id and id = new.entity_id)
    when 'opportunity' then exists (select 1 from public.opportunities where tenant_id = new.tenant_id and id = new.entity_id)
  end;
  if not v_found then
    raise exception 'note target not found in tenant' using errcode = 'foreign_key_violation';
  end if;
  return new;
end;
$$;

create trigger notes_enforce_entity_tenant before insert or update on public.notes
  for each row execute function app.enforce_note_entity_tenant();

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  owner_id uuid,
  contact_id uuid,
  opportunity_id uuid,
  title text not null check (length(btrim(title)) > 0),
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, owner_id) references public.memberships (tenant_id, user_id) on delete set null (owner_id),
  foreign key (tenant_id, contact_id) references public.contacts (tenant_id, id) on delete cascade,
  foreign key (tenant_id, opportunity_id) references public.opportunities (tenant_id, id) on delete cascade
);

create index tasks_tenant_owner_open_idx on public.tasks (tenant_id, owner_id) where completed_at is null;

create trigger tasks_set_updated_at before update on public.tasks
  for each row execute function app.set_updated_at();
