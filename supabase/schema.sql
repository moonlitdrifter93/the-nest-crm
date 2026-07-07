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
