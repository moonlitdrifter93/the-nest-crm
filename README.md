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

Password: `thenest2026` (override with `VITE_APP_PASSWORD`).

With no Supabase configured the app runs in **local mode**: data lives in
`localStorage`, seeded from the baked-in snapshot (`src/data/seed.json`,
export dated 2026-06-18). The header shows which mode you're in.

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

## Refreshing the seed from a CRM export

```bash
node scripts/prepare-seed.mjs path/to/export.json
```

Deduplicates, fixes legacy statuses, assigns stable ids, writes
`src/data/seed.json`. Note the seed only matters for first-run/local mode —
once Supabase holds data, it wins.

## Roadmap

- **Outlook / Microsoft 365 integration** (next up): register an Azure AD app
  in the thenest.com.au tenant, then use MSAL + Microsoft Graph to sign in
  with @thenest.com.au accounts, log emails against firms (match on contact
  email domain), and push follow-ups to Outlook calendar. Replaces the shared
  password with real per-user sign-in, at which point the Supabase RLS
  policies in `supabase/schema.sql` should be tightened to authenticated
  users.
- Calendar / SPIF tracker / documents tabs from the old CRM as needed.
