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
