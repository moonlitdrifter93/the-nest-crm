# The Nest CRM

Rebuild of the internal fund-manager CRM (formerly the single-file app on
Netlify). Tracks ~525 fund management firms for The Nest, with a priority
engine that surfaces the firms worth acting on next.

**Stack:** Vite + React + TypeScript · Supabase (one row per firm) · Netlify.

## Views

- **Priorities** — the default view.
  - *Close queue*: unsigned pipeline (Active / Engaged / Prospecting) ranked by
    a transparent score. Every card shows exactly why it ranks where it does.
  - *Platform coverage*: live funds per asset class, worst-covered first.
    Click a class to focus the queue on firms that would fill that gap.
  - *On-platform upkeep*: Live/Onboarded firms with an overdue or imminent
    follow-up, or an open action.
- **Pipeline** — the full table: search, status/owner/asset-class filters,
  sortable columns, click any row to edit.
- **Live funds** — the funds actually on The Nest (Live), plus Onboarded
  firms coming online. What you see depends on who you sign in as:
  - *Matthew Downing* — every fund (full view).
  - *Raphael Pitts / Jack Woods* — a pod: each sees the funds allocated to
    either of them.
  - *Timothy Easterbrook* — his own allocations.

  Visibility rules live in `src/lib/users.ts` and are trivial to adjust.

## Priority score

Three signal groups (see `src/lib/score.ts` — weights are plain constants):

1. **Sign-up propensity** — stage (Active +30, Engaged +22, Prospecting +5),
   has a deal to list +10, contacted in the last fortnight +6, closing
   language in the notes (agreement / DocuSign / contract / sign) +8.
2. **Asset-class gap** — how thin the platform's live coverage is for the
   firm's best class: empty class +25, one live fund +18, two +12, three-four +6.
3. **Action & link** — follow-up overdue +15 (due within a week +10, scheduled
   +4), next action defined +8, direct email +4, LinkedIn/site +3.

Live/Onboarded firms are excluded from the close queue (already signed) and
appear in the upkeep list instead when something is pending.

## Running locally

```bash
npm install
npm run dev
```

Sign in as yourself. Default passwords (override via env vars
`VITE_PW_MATTHEW`, `VITE_PW_RAPHAEL`, `VITE_PW_JACK`, `VITE_PW_TIMOTHY`):

| User                | Default password  |
| ------------------- | ----------------- |
| Matthew Downing     | `downing2026`     |
| Raphael Pitts       | `pitts2026`       |
| Jack Woods          | `woods2026`       |
| Timothy Easterbrook | `easterbrook2026` |

> Sign-in controls which *view* each person gets. Like the old CRM's shared
> password, it is client-side only — not hard security. Real enforcement
> arrives with Microsoft sign-in + Supabase RLS (see roadmap).

With no Supabase configured the app runs in **local mode**: data lives in
`localStorage`, seeded from the baked-in snapshot (`src/data/seed.json`,
pulled live from the legacy CRM's database on 2026-07-06). The header shows
which mode you're in.

## Supabase setup (dedicated project)

This app uses its own Supabase project — deliberately **not** the old CRM's
project, so the two never fight over data.

1. Create a new project at [supabase.com](https://supabase.com).
2. In the SQL editor, run `supabase/schema.sql` (creates the `firms` table —
   one row per firm, so concurrent edits to different firms can't clobber
   each other, unlike the old single-JSON-blob model).
3. Set env vars (locally in `.env.local`, and in Netlify → Site settings →
   Environment variables):

   ```
   VITE_SUPABASE_URL=https://<project>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon key>
   ```

4. On first load with an empty table the app pushes the baked-in seed up
   automatically. From then on Supabase is the source of truth.

## Deploying to Netlify

Connect this repo to a new Netlify site — `netlify.toml` already sets the
build (`npm run build`, publish `dist`). Add the two Supabase env vars, and
`VITE_APP_PASSWORD` if you want a different password. Every push to the
default branch deploys.

## Refreshing the seed

Straight from the legacy CRM's database (what the team is editing today):

```bash
node scripts/pull-live.mjs
```

Or from a JSON export file:

```bash
node scripts/prepare-seed.mjs path/to/export.json
```

Both deduplicate, fix legacy statuses, assign stable ids, and write
`src/data/seed.json`. Note the seed only matters for first-run/local mode —
once the new Supabase holds data, it wins; do a final `pull-live` +
re-deploy just before cutting over.

## Roadmap

- **Outlook / Microsoft 365 integration** (next up): register an Azure AD app
  in the thenest.com.au tenant, then use MSAL + Microsoft Graph to sign in
  with @thenest.com.au accounts, log emails against firms (match on contact
  email domain), and push follow-ups to Outlook calendar. Replaces the shared
  password with real per-user sign-in, at which point the Supabase RLS
  policies in `supabase/schema.sql` should be tightened to authenticated
  users.
- Calendar / SPIF tracker / documents tabs from the old CRM as needed.
