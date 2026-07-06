-- The Nest CRM — schema for the dedicated Supabase project.
-- Run this once in the SQL editor of the new project.

create table if not exists public.firms (
  id text primary key,
  name text not null,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.firms enable row level security;

-- v1 access model: the anon key is the shared team credential (the app sits
-- behind its own password gate, same trust model as the old CRM). Tighten to
-- per-user Supabase Auth policies when accounts are introduced alongside the
-- Outlook integration.
create policy "team read" on public.firms for select using (true);
create policy "team insert" on public.firms for insert with check (true);
create policy "team update" on public.firms for update using (true);
create policy "team delete" on public.firms for delete using (true);
