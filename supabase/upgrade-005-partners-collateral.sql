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
