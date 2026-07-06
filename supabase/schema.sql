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
