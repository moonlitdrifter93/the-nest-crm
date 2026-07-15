-- The Nest CRM — schema for the dedicated Supabase project.
-- Run this once in the SQL editor of the new project.

create table if not exists public.firms (
  id text primary key,
  name text not null,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.firms enable row level security;

-- Only signed-in team members can touch the data. Accounts are created in
-- the dashboard (Authentication → Users → Add user → email + password,
-- auto-confirm on) for each address listed in src/lib/users.ts. The anon
-- key alone grants nothing.
create policy "team read" on public.firms
  for select to authenticated using (true);
create policy "team insert" on public.firms
  for insert to authenticated with check (true);
create policy "team update" on public.firms
  for update to authenticated using (true);
create policy "team delete" on public.firms
  for delete to authenticated using (true);

-- Note: any authenticated account in this project can read/write all firms;
-- the per-person fund views are applied in the app. If you later want
-- Raph's reduced view enforced at the database level too, add per-row
-- policies keyed on auth.email() against data->>'owner'.
-- Upgrade 001 — run once in the CRM's Supabase SQL editor (the-nest-crm
-- project). Adds the SPIF closes tracker and the platform live-funds mirror.

create table if not exists public.spif_events (
  id bigint generated always as identity primary key,
  ts timestamptz not null default now(),
  firm_id text not null,
  firm_name text not null,
  owner text,
  kind text not null check (kind in ('Onboarded', 'Live')),
  logged_by text
);

alter table public.spif_events enable row level security;

create policy "team read" on public.spif_events
  for select to authenticated using (true);
create policy "team insert" on public.spif_events
  for insert to authenticated with check (true);
create policy "team delete" on public.spif_events
  for delete to authenticated using (true);

-- Mirror of live funds on The Nest platform, written by
-- scripts/sync-platform.mjs with service keys (never from the browser).
-- Read-only for the team.
create table if not exists public.platform_funds (
  firm_id bigint primary key,
  firm_name text not null,
  is_enterprise boolean not null default false,
  head_office_city text,
  fum numeric,
  approved_products integer not null default 0,
  live_products integer not null default 0,
  asset_classes text,
  synced_at timestamptz not null default now()
);

alter table public.platform_funds enable row level security;

create policy "team read" on public.platform_funds
  for select to authenticated using (true);
-- Upgrade 002 — run once in the CRM's Supabase SQL editor, after upgrade 001.
-- 1. Master deal book table, locked at the database level to the admin.
-- 2. SPIF edits (deletes) restricted to the admin.

-- ---------- deals: admin-only in and out ----------
-- Row-level security answers ONLY to the admin's signed-in account. Other
-- team members get zero rows on select and are refused writes — the deal
-- figures never leave the database for them.

create table if not exists public.deals (
  firm_id text primary key references public.firms(id) on delete cascade,
  amount text,
  update_text text,
  update_at date,
  updated_at timestamptz not null default now()
);

alter table public.deals enable row level security;

create policy "admin all" on public.deals
  for all to authenticated
  using ((auth.jwt() ->> 'email') = 'matthew.downing@thenest.com.au')
  with check ((auth.jwt() ->> 'email') = 'matthew.downing@thenest.com.au');

-- ---------- spif_events: only the admin can remove entries ----------
-- Inserts stay open to the team (closes are auto-logged when anyone moves a
-- firm to Onboarded/Live); deletion/correction is admin-only. There is no
-- update policy, so rows are immutable for everyone.

drop policy if exists "team delete" on public.spif_events;

create policy "admin delete" on public.spif_events
  for delete to authenticated
  using ((auth.jwt() ->> 'email') = 'matthew.downing@thenest.com.au');
-- Upgrade 003 — run once in the CRM's Supabase SQL editor, after upgrade 002.
-- 1. Deal book becomes standalone tiles: own id, type tags, drag position.
--    Existing rows are carried across.
-- 2. Admin can edit SPIF entries (update policy).

-- ---------- deals: tile model ----------
create table if not exists public.deals_v2 (
  id bigint generated always as identity primary key,
  name text not null,
  firm_id text references public.firms(id) on delete set null,
  is_placement boolean not null default false,
  plan text not null default '' check (plan in ('', 'PPR', 'Enterprise')),
  amount text,
  update_text text,
  update_at date,
  position integer not null default 0,
  updated_at timestamptz not null default now()
);

-- carry over anything saved under the old firm-keyed model
insert into public.deals_v2 (name, firm_id, amount, update_text, update_at)
select coalesce(f.name, d.firm_id), d.firm_id, d.amount, d.update_text, d.update_at
from public.deals d
left join public.firms f on f.id = d.firm_id;

drop table public.deals;
alter table public.deals_v2 rename to deals;

alter table public.deals enable row level security;

create policy "admin all" on public.deals
  for all to authenticated
  using ((auth.jwt() ->> 'email') = 'matthew.downing@thenest.com.au')
  with check ((auth.jwt() ->> 'email') = 'matthew.downing@thenest.com.au');

-- ---------- spif_events: admin can edit ----------
create policy "admin update" on public.spif_events
  for update to authenticated
  using ((auth.jwt() ->> 'email') = 'matthew.downing@thenest.com.au')
  with check ((auth.jwt() ->> 'email') = 'matthew.downing@thenest.com.au');
-- Upgrade 005 — Partner portal + collateral library.
-- Run once in the CRM's Supabase SQL editor, after upgrade 004.
--
-- SECURITY: this introduces EXTERNAL partner logins. Until now every
-- authenticated account could read the CRM tables; that must stop before
-- partners get accounts. This migration:
--   1. Adds an is_team() helper and locks firms/deals/spif/platform_funds to
--      the team only.
--   2. Adds partners, partner_intros, partner_events — partners see ONLY
--      their own rows.
--   3. Adds a collateral library (Storage bucket + metadata) with a
--      partner-visible flag.

-- ---------- who is staff ----------
create or replace function public.is_team()
returns boolean language sql stable as $$
  select coalesce(auth.jwt() ->> 'email', '') in (
    'matthew.downing@thenest.com.au',
    'raph.pitts@thenest.com.au'
  );
$$;

-- The partner portal is administered by Matthew only.
create or replace function public.is_admin()
returns boolean language sql stable as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'matthew.downing@thenest.com.au';
$$;

-- ---------- lock the CRM tables to the team ----------
-- firms
drop policy if exists "team read" on public.firms;
drop policy if exists "team insert" on public.firms;
drop policy if exists "team update" on public.firms;
drop policy if exists "team delete" on public.firms;
create policy "team all" on public.firms for all to authenticated
  using (public.is_team()) with check (public.is_team());

-- platform_funds (read-only mirror)
drop policy if exists "team read" on public.platform_funds;
create policy "team read" on public.platform_funds for select to authenticated
  using (public.is_team());

-- spif_events: team read/insert, admin edit/delete (unchanged owner rules,
-- just gated to team for read/insert now)
drop policy if exists "team read" on public.spif_events;
drop policy if exists "team insert" on public.spif_events;
create policy "team read" on public.spif_events for select to authenticated
  using (public.is_team());
create policy "team insert" on public.spif_events for insert to authenticated
  with check (public.is_team());
-- (admin delete / admin update policies from upgrades 002/003 remain.)

-- deals already admin-only (upgrade 003) — no change needed.

-- ---------- partners ----------
create table if not exists public.partners (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  name text not null,
  company text,
  phone text,
  fee_terms text,          -- free-text agreed terms
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- the partner row for the current signed-in partner
create or replace function public.my_partner_id()
returns uuid language sql stable as $$
  select id from public.partners
  where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

alter table public.partners enable row level security;
create policy "admin manage partners" on public.partners for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "partner sees self" on public.partners for select to authenticated
  using (id = public.my_partner_id());

-- ---------- introductions (investor + fund manager) ----------
create table if not exists public.partner_intros (
  id bigint generated always as identity primary key,
  partner_id uuid not null references public.partners(id) on delete cascade,
  kind text not null check (kind in ('investor', 'fund_manager')),
  name text not null,
  contact_email text,
  contact_note text,           -- partner's context on the intro
  firm_id text references public.firms(id) on delete set null, -- team links later
  status text not null default 'Submitted'
    check (status in ('Submitted', 'In progress', 'Met', 'Converted', 'Declined')),
  fee_amount numeric,
  fee_status text not null default 'Pending'
    check (fee_status in ('Pending', 'Agreed', 'Invoiced', 'Paid', 'N/A')),
  team_note text,              -- staff-only note
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.partner_intros enable row level security;

-- team: full access
create policy "admin all intros" on public.partner_intros for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
-- partner: read own, submit own; may edit only their own note fields
create policy "partner reads own intros" on public.partner_intros for select to authenticated
  using (partner_id = public.my_partner_id());
create policy "partner submits intros" on public.partner_intros for insert to authenticated
  with check (partner_id = public.my_partner_id() and status = 'Submitted');

-- ---------- events ----------
create table if not exists public.partner_events (
  id bigint generated always as identity primary key,
  partner_id uuid not null references public.partners(id) on delete cascade,
  title text not null,
  event_date date,
  kind text,                   -- e.g. dinner, webinar, conference
  location text,
  notes text,
  created_at timestamptz not null default now()
);
alter table public.partner_events enable row level security;
create policy "admin all events" on public.partner_events for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "partner reads own events" on public.partner_events for select to authenticated
  using (partner_id = public.my_partner_id());
create policy "partner logs events" on public.partner_events for insert to authenticated
  with check (partner_id = public.my_partner_id());

-- ---------- collateral library ----------
insert into storage.buckets (id, name, public)
values ('collateral', 'collateral', false)
on conflict (id) do nothing;

create table if not exists public.collateral (
  id bigint generated always as identity primary key,
  name text not null,
  description text,
  path text not null,          -- storage object path within the bucket
  size bigint,
  content_type text,
  partner_visible boolean not null default false,
  uploaded_by text,
  created_at timestamptz not null default now()
);
alter table public.collateral enable row level security;
-- team manages everything
create policy "team manage collateral" on public.collateral for all to authenticated
  using (public.is_team()) with check (public.is_team());
-- partners see only partner-visible items
create policy "partner sees shared collateral" on public.collateral for select to authenticated
  using (partner_visible and public.my_partner_id() is not null);

-- Storage object policies. Partner-visible files live under a "partner/"
-- prefix; internal files under "internal/". Team can do anything; partners can
-- only read the partner-prefixed objects.
create policy "team storage all" on storage.objects for all to authenticated
  using (bucket_id = 'collateral' and public.is_team())
  with check (bucket_id = 'collateral' and public.is_team());
create policy "partner storage read" on storage.objects for select to authenticated
  using (
    bucket_id = 'collateral'
    and (storage.foldername(name))[1] = 'partner'
    and public.my_partner_id() is not null
  );
