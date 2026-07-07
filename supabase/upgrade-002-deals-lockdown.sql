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
