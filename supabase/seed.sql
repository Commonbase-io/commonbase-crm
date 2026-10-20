-- Synthetic demo data. Every person, company, domain, and address here is
-- fictional. Domains use the reserved `.example` TLD so nothing can ever be
-- delivered. Passwords are for local development only.
--
-- Two tenants, each with its own mock Apollo connection, prove per-account
-- isolation:
--   A  brs           pilot tenant (commercial moving)       a0000000-...
--   B  harbor-demo   second synthetic tenant (facilities)  b0000000-...
-- Both tenants deliberately contain a company on the same domain
-- (shared-domain.example) to show that dedupe is per tenant.
--
-- Local logins (password: demo-password-1):
--   staff@commonbase.example        tenant_admin in A and B (explicit Commonbase staff membership)
--   admin@brs-demo.example          tenant_admin    A
--   manager@brs-demo.example        sales_manager   A
--   rep@brs-demo.example            sales_rep       A
--   admin@harbor-demo.example       tenant_admin    B
--   rep@harbor-demo.example         sales_rep       B

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------

-- Supabase Auth scans its token columns as non-null strings and needs
-- created_at/updated_at, so they are set explicitly for password sign-in to work.
create temporary table seed_users (id uuid, email text, display_name text);
insert into seed_users (id, email, display_name) values
  ('c0000000-0000-4000-8000-000000000001', 'staff@commonbase.example', 'Commonbase Staff (demo)'),
  ('a0000000-0000-4000-8000-0000000000a1', 'admin@brs-demo.example', 'Avery Admin (demo)'),
  ('a0000000-0000-4000-8000-0000000000a2', 'manager@brs-demo.example', 'Morgan Manager (demo)'),
  ('a0000000-0000-4000-8000-0000000000a3', 'rep@brs-demo.example', 'Riley Rep (demo)'),
  ('b0000000-0000-4000-8000-0000000000b1', 'admin@harbor-demo.example', 'Blake Admin (demo)'),
  ('b0000000-0000-4000-8000-0000000000b3', 'rep@harbor-demo.example', 'Casey Rep (demo)')
;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token,
  created_at, updated_at
)
select
  '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
  extensions.crypt('demo-password-1', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('display_name', u.display_name),
  '', '', '', '', '', '', '', '',
  now(), now()
from seed_users u;

insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text, 'email',
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), now(), now(), now()
from seed_users u;
drop table seed_users;
-- profiles are created by the on_auth_user_created trigger.

-- ---------------------------------------------------------------------------
-- Tenants and memberships
-- ---------------------------------------------------------------------------

insert into public.tenants (id, name, slug, postal_address, config) values
  ('a0000000-0000-4000-8000-000000000001', 'BRS (demo)', 'brs',
   '100 Example Avenue, Suite 1, Springfield, ZZ 00000',
   '{
      "industry_label": "Commercial moving",
      "trigger_event_types": ["lease_expiration", "relocation", "new_office", "headcount_growth", "funding_round", "merger_acquisition", "facility_consolidation"],
      "target_titles": ["Facilities Manager", "Office Manager", "Director of Operations", "Head of Workplace", "Real Estate Manager", "CFO"],
      "prioritize_trigger_events": true
    }'::jsonb),
  ('b0000000-0000-4000-8000-000000000001', 'Harbor Facilities (demo)', 'harbor-demo',
   '200 Sample Road, Floor 2, Riverton, ZZ 00001',
   '{
      "industry_label": "Facilities services",
      "trigger_event_types": ["new_office", "headcount_growth", "contract_renewal"],
      "target_titles": ["Facilities Director", "Procurement Manager"],
      "prioritize_trigger_events": false
    }'::jsonb);

insert into public.memberships (tenant_id, user_id, role) values
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'tenant_admin'),
  ('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-0000000000a1', 'tenant_admin'),
  ('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-0000000000a2', 'sales_manager'),
  ('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-0000000000a3', 'sales_rep'),
  ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'tenant_admin'),
  ('b0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-0000000000b1', 'tenant_admin'),
  ('b0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-0000000000b3', 'sales_rep');

-- ---------------------------------------------------------------------------
-- One mock Apollo connection per tenant, each with its own mailbox.
-- credential_ref uses the mock scheme bound to the connection id; the
-- registry refuses any ref not bound to the requesting tenant's connection.
-- ---------------------------------------------------------------------------

insert into public.provider_connections
  (id, tenant_id, provider, mode, external_account_id, account_holder, billing_party, plan_tier, credential_ref, status, last_verified_at)
values
  ('a0000000-0000-4000-8000-0000000000c1', 'a0000000-0000-4000-8000-000000000001', 'apollo', 'mock',
   'mock-acct-brs', 'commonbase', 'commonbase', 'mock',
   'mock:a0000000-0000-4000-8000-0000000000c1', 'connected', now()),
  ('b0000000-0000-4000-8000-0000000000c1', 'b0000000-0000-4000-8000-000000000001', 'apollo', 'mock',
   'mock-acct-harbor', 'client', 'client', 'mock',
   'mock:b0000000-0000-4000-8000-0000000000c1', 'connected', now());

insert into public.mailboxes (id, tenant_id, provider_connection_id, email, external_id, status, daily_limit) values
  ('a0000000-0000-4000-8000-0000000000d1', 'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-0000000000c1',
   'outreach@brs-demo.example', 'mock-mbx-brs-1', 'active', 40),
  ('b0000000-0000-4000-8000-0000000000d1', 'b0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-0000000000c1',
   'hello@harbor-demo.example', 'mock-mbx-harbor-1', 'active', 30);

insert into public.sync_jobs (tenant_id, provider_connection_id, kind, status, last_success_at) values
  ('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-0000000000c1', 'opt_outs', 'succeeded', now() - interval '2 hours'),
  ('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-0000000000c1', 'email_activity', 'succeeded', now() - interval '2 hours'),
  ('b0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-0000000000c1', 'opt_outs', 'succeeded', now() - interval '3 hours');

-- ---------------------------------------------------------------------------
-- Tenant A (BRS) CRM data
-- ---------------------------------------------------------------------------

insert into public.companies (id, tenant_id, name, domain, industry, location, employee_count, is_customer, source) values
  ('a1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Lumen Ledger Partners', 'lumen-ledger.example', 'Accounting', 'Springfield, ZZ', 180, false, 'prospect_search'),
  ('a1000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'Quarry Lane Biotech', 'quarry-lane.example', 'Biotechnology', 'Springfield, ZZ', 420, false, 'prospect_search'),
  ('a1000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'Northgate Legal Group', 'northgate-legal.example', 'Legal services', 'Shelbyville, ZZ', 95, false, 'manual'),
  ('a1000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'Pinecrest Software', 'pinecrest-sw.example', 'Software', 'Springfield, ZZ', 260, false, 'prospect_search'),
  ('a1000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000001', 'Orchard Health Clinics', 'orchard-health.example', 'Healthcare', 'Capital City, ZZ', 610, true, 'import'),
  ('a1000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000001', 'Tidewater Insurance', 'tidewater-ins.example', 'Insurance', 'Ogdenville, ZZ', 340, false, 'prospect_search'),
  ('a1000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-000000000001', 'Shared Domain Holdings (A)', 'shared-domain.example', 'Holding company', 'Springfield, ZZ', 50, false, 'manual');

insert into public.company_trigger_events (tenant_id, company_id, event_type, event_date, source, notes) values
  ('a0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'lease_expiration', current_date + 120, 'mock_apollo', 'Synthetic: lease ends in about four months'),
  ('a0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002', 'funding_round', current_date - 30, 'mock_apollo', 'Synthetic: Series C announced'),
  ('a0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002', 'headcount_growth', current_date - 10, 'mock_apollo', 'Synthetic: 25% headcount growth year over year'),
  ('a0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000004', 'relocation', current_date + 60, 'manual', 'Synthetic: announced move to a new campus'),
  ('a0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000006', 'merger_acquisition', current_date - 45, 'mock_apollo', 'Synthetic: acquired a regional competitor'),
  ('a0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000006', 'facility_consolidation', current_date + 90, 'manual', 'Synthetic: consolidating two offices into one');

insert into public.contacts (id, tenant_id, company_id, name, title, email, email_status, enrichment_status, source) values
  ('a2000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'Dana Example', 'Office Manager', 'dana@lumen-ledger.example', 'verified', 'enriched', 'prospect_search'),
  ('a2000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002', 'Jordan Sample', 'Director of Operations', 'jordan@quarry-lane.example', 'verified', 'enriched', 'prospect_search'),
  ('a2000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002', 'Kai Placeholder', 'Facilities Manager', 'kai@quarry-lane.example', 'unverified', 'not_requested', 'prospect_search'),
  ('a2000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000003', 'Lee Fictional', 'Office Manager', 'lee@northgate-legal.example', 'verified', 'enriched', 'manual'),
  ('a2000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000004', 'Sam Testcase', 'Head of Workplace', 'sam@pinecrest-sw.example', 'verified', 'enriched', 'prospect_search'),
  ('a2000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000005', 'Pat Demo', 'Facilities Manager', 'pat@orchard-health.example', 'verified', 'enriched', 'import'),
  ('a2000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000006', 'Robin Mock', 'Real Estate Manager', 'robin@tidewater-ins.example', 'verified', 'enriched', 'prospect_search'),
  ('a2000000-0000-4000-8000-000000000008', 'a0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000006', 'Taylor Optout', 'CFO', 'taylor@tidewater-ins.example', 'verified', 'enriched', 'prospect_search');

-- Taylor opted out (synced from the mock provider); a manual domain suppression too.
insert into public.suppression_entries (tenant_id, scope, value_hash, reason, source) values
  ('a0000000-0000-4000-8000-000000000001', 'email', app.suppression_hash('taylor@tidewater-ins.example'), 'Unsubscribed via provider', 'provider_opt_out'),
  ('a0000000-0000-4000-8000-000000000001', 'domain', app.suppression_hash('do-not-contact.example'), 'Requested no contact', 'manual'),
  ('a0000000-0000-4000-8000-000000000001', 'domain', app.suppression_hash('orchard-health.example'), 'Existing customer', 'customer');

-- An active campaign: inserted as draft, given compliant steps, then moved
-- through approval exactly as the server would.
insert into public.campaigns (id, tenant_id, provider_connection_id, mailbox_id, name) values
  ('a3000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-0000000000c1',
   'a0000000-0000-4000-8000-0000000000d1', 'Lease expirations: next 6 months'),
  ('a3000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-0000000000c1',
   'a0000000-0000-4000-8000-0000000000d1', 'Recently funded: growing teams');

insert into public.sequence_steps (tenant_id, campaign_id, position, step_type, delay_days, subject, body) values
  ('a0000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001', 1, 'email', 0,
   'Planning around your lease date',
   E'Hi {{first_name}},\n\nTeams with a lease ending soon often start move planning 4-6 months out. Happy to share a sample timeline.\n\n{{sender_name}}\n{{sender_postal_address}}\nUnsubscribe: {{unsubscribe_url}}'),
  ('a0000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001', 2, 'email', 4,
   'Sample move timeline',
   E'Hi {{first_name}}, following up with the timeline I mentioned.\n\n{{sender_name}}\n{{sender_postal_address}}\nUnsubscribe: {{unsubscribe_url}}'),
  ('a0000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000002', 1, 'email', 0,
   'Congrats on the growth',
   E'Hi {{first_name}}, growing teams often outgrow space fast.\n\n{{sender_name}}\n{{sender_postal_address}}');
   -- ^ deliberately missing {{unsubscribe_url}}: this draft cannot be approved.

update public.campaigns
   set status = 'approved', approved_by = 'a0000000-0000-4000-8000-0000000000a2', approved_at = now() - interval '20 days'
 where id = 'a3000000-0000-4000-8000-000000000001';
update public.campaigns set status = 'enrolling', external_id = 'mock-seq-a0000000-0000-4000-8000-0000000000c1-seed1'
 where id = 'a3000000-0000-4000-8000-000000000001';

insert into public.campaign_contacts (tenant_id, campaign_id, contact_id, enrollment_status, enrolled_at, external_ref) values
  ('a0000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'enrolled', now() - interval '19 days', 'mock-enr-1'),
  ('a0000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000002', 'enrolled', now() - interval '19 days', 'mock-enr-2'),
  ('a0000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000005', 'enrolled', now() - interval '19 days', 'mock-enr-3'),
  ('a0000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000007', 'enrolled', now() - interval '19 days', 'mock-enr-4');

update public.campaigns set status = 'active' where id = 'a3000000-0000-4000-8000-000000000001';

insert into public.activities (tenant_id, contact_id, campaign_id, event_type, occurred_at, external_event_id) values
  ('a0000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001', 'email_sent', now() - interval '19 days', 'mock-evt-a-001'),
  ('a0000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000002', 'a3000000-0000-4000-8000-000000000001', 'email_sent', now() - interval '19 days', 'mock-evt-a-002'),
  ('a0000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000005', 'a3000000-0000-4000-8000-000000000001', 'email_sent', now() - interval '19 days', 'mock-evt-a-003'),
  ('a0000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000007', 'a3000000-0000-4000-8000-000000000001', 'email_sent', now() - interval '19 days', 'mock-evt-a-004'),
  ('a0000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001', 'email_sent', now() - interval '15 days', 'mock-evt-a-005'),
  ('a0000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000002', 'a3000000-0000-4000-8000-000000000001', 'email_sent', now() - interval '15 days', 'mock-evt-a-006'),
  ('a0000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001', 'email_replied', now() - interval '14 days', 'mock-evt-a-007'),
  ('a0000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001', 'positive_reply', now() - interval '14 days', 'mock-evt-a-008'),
  ('a0000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000002', 'a3000000-0000-4000-8000-000000000001', 'email_replied', now() - interval '13 days', 'mock-evt-a-009'),
  ('a0000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000002', 'a3000000-0000-4000-8000-000000000001', 'positive_reply', now() - interval '13 days', 'mock-evt-a-010'),
  ('a0000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000005', 'a3000000-0000-4000-8000-000000000001', 'email_replied', now() - interval '12 days', 'mock-evt-a-011');

insert into public.opportunities
  (id, tenant_id, company_id, contact_id, owner_id, title, stage, estimated_value, source_campaign_id,
   first_touch_at, qualified_at, quote_requested_at, closed_at, lost_reason)
values
  ('a4000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001',
   'a2000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-0000000000a3', 'Lumen Ledger office move', 'quote_requested', 48000,
   'a3000000-0000-4000-8000-000000000001', now() - interval '19 days', now() - interval '12 days', now() - interval '8 days', null, null),
  ('a4000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002',
   'a2000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-0000000000a3', 'Quarry Lane lab and office relocation', 'won', 125000,
   'a3000000-0000-4000-8000-000000000001', now() - interval '19 days', now() - interval '11 days', now() - interval '9 days', now() - interval '2 days', null),
  ('a4000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000004',
   'a2000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-0000000000a2', 'Pinecrest campus move', 'qualified', 90000,
   'a3000000-0000-4000-8000-000000000001', now() - interval '19 days', now() - interval '5 days', null, null, null),
  ('a4000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000003',
   'a2000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-0000000000a3', 'Northgate floor consolidation', 'interested', 22000,
   null, now() - interval '7 days', null, null, null, null),
  ('a4000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000006',
   'a2000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-0000000000a2', 'Tidewater post-merger consolidation', 'lost', 70000,
   'a3000000-0000-4000-8000-000000000001', now() - interval '19 days', now() - interval '10 days', now() - interval '9 days', now() - interval '3 days',
   'Chose incumbent mover');

insert into public.notes (tenant_id, entity_type, entity_id, author_id, body) values
  ('a0000000-0000-4000-8000-000000000001', 'opportunity', 'a4000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-0000000000a3',
   'Synthetic note: walkthrough scheduled; needs certificate of insurance before quoting.');

insert into public.tasks (tenant_id, owner_id, contact_id, opportunity_id, title, due_at) values
  ('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-0000000000a3', 'a2000000-0000-4000-8000-000000000001',
   'a4000000-0000-4000-8000-000000000001', 'Send quote for Lumen Ledger move', now() + interval '2 days');

-- ---------------------------------------------------------------------------
-- Tenant B (Harbor) CRM data: deliberately small and different.
-- ---------------------------------------------------------------------------

insert into public.companies (id, tenant_id, name, domain, industry, location, employee_count, is_customer, source) values
  ('b1000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'Riverbend Logistics', 'riverbend-logistics.example', 'Logistics', 'Riverton, ZZ', 300, false, 'prospect_search'),
  ('b1000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'Shared Domain Holdings (B)', 'shared-domain.example', 'Holding company', 'Riverton, ZZ', 50, false, 'manual');

insert into public.contacts (id, tenant_id, company_id, name, title, email, email_status, enrichment_status, source) values
  ('b2000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'Morgan Synthetic', 'Facilities Director', 'morgan@riverbend-logistics.example', 'verified', 'enriched', 'prospect_search'),
  -- Same email exists only in tenant B; tenant A has a different contact at this company domain.
  ('b2000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000002', 'Alex Shared', 'Procurement Manager', 'alex@shared-domain.example', 'unverified', 'not_requested', 'manual');

insert into public.opportunities (id, tenant_id, company_id, contact_id, owner_id, title, stage, estimated_value, first_touch_at) values
  ('b4000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001',
   'b2000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-0000000000b3', 'Riverbend facilities contract', 'contacted', 30000, now() - interval '4 days');

insert into public.audit_logs (tenant_id, actor_id, action, metadata) values
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'tenant.seeded', '{"note":"synthetic demo data"}'),
  ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'tenant.seeded', '{"note":"synthetic demo data"}');
