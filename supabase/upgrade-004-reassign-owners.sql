-- Upgrade 004 — run once in the CRM's Supabase SQL editor.
-- Jack Woods and Timothy Easterbrook have left The Nest: reassign their
-- firms 50/50 to Raphael Pitts and Matthew Downing (alternating by firm
-- name, same rule as the baked-in seed).

with ranked as (
  select id,
         row_number() over (order by lower(name)) as rn
  from public.firms
  where data ->> 'owner' in ('Jack Woods', 'Timothy Easterbrook')
)
update public.firms f
set data = jsonb_set(
      jsonb_set(
        f.data,
        '{owner}',
        to_jsonb(case when r.rn % 2 = 1 then 'Raphael Pitts' else 'Matthew Downing' end)
      ),
      '{owners}',
      jsonb_build_array(case when r.rn % 2 = 1 then 'Raphael Pitts' else 'Matthew Downing' end)
    ),
    updated_at = now()
from ranked r
where f.id = r.id;
