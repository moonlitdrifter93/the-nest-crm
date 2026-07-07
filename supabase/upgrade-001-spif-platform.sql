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
