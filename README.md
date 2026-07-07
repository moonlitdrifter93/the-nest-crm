# The Nest CRM

Rebuild of the internal fund-manager CRM (formerly the single-file app on
Netlify). Tracks ~525 fund management firms for The Nest, with a priority
engine that surfaces the firms worth acting on next.

**Stack:** Vite + React + TypeScript · Supabase (one row per firm) · Netlify.

## Views

- **Universe** — the total universe of firms account managers can call to get
  on The Nest: search, stage/owner/asset-class filters, sortable columns
  (including the priority score), PPR/Enterprise plan column, click any row
  to edit.
- **Pipeline** — the working list of unsigned firms (Active / Engaged /
  Prospecting), ordered so firms **without a touchpoint float to the top**:
  never-contacted first, then longest since last contact, with a touch-gap
  column.
- **Live funds** — two sources on one page:
  - *Platform data*: the actual live funds mirrored from The Nest's
    production database (see *Platform sync* below), with the platform's own
    Enterprise/PPR flag and live-product counts.
  - *CRM statuses*: Live and Onboarded firms as tracked by the team.
  Visibility: Matthew sees every fund; everyone else sees only funds
  allocated to them (rules in `src/lib/users.ts`).
- **SPIF** — how many funds are being closed. A close is logged automatically
  whenever a firm's stage moves to **Onboarded** or **Live**: weekly/monthly
  tiles, an owner leaderboard, and the full log. Entries are immutable;
  only the admin can remove a mis-log (enforced by database policy).
- **Master** *(Matthew only)* — the private deal book: every firm allocated
  to Matthew or tagged Placement, reduced to Name / Type (Placement,
  PPR/Enterprise) / Amount / latest Update, edited inline. Deal figures live
  in their own `deals` table whose row-level security answers **only to the
  admin's account** — other logins get zero rows and refused writes, so the
  numbers never leave the database for them.
- **FM onboarding ↗** (header link) — jumps to the fund manager onboarding
  page on The Nest (`VITE_ONBOARDING_URL`, defaults to
  thenest.com.au/fund-manager/onboarding).
- **📞 Call sheet** (button, top right) — the daily list: top 30–50
  most-likely-to-sign firms with the person to call, their number and email
  highlighted as click-to-call / click-to-email, the intel notes, and the
  scoring reasons. Filterable per account manager.

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

## Signing in

**With Supabase configured (production):** each person has a real account —
email + password, checked by Supabase Auth, session managed server-side.
Passwords are never in the app bundle, and the database only answers to
signed-in accounts.

To create the logins, in the Supabase dashboard go to **Authentication →
Users → Add user** (tick *Auto Confirm*) and add:

- `matthew.downing@thenest.com.au` — full fund view
- `raph.pitts@thenest.com.au` — pod view (his + Jack's funds)

(and Jack / Tim the same way when wanted). The email must match the profile
in `src/lib/users.ts` — Matthew's and Raph's are confirmed; Jack's and
Tim's are assumed to follow `firstname.lastname@thenest.com.au`, so correct
them there first if they differ.

**Local mode (no Supabase, dev only):** a simple team picker with default
passwords (`downing2026`, `pitts2026`, `woods2026`, `easterbrook2026`;
override via `VITE_PW_*` env vars). This is view-switching convenience, not
security — data lives in `localStorage`, seeded from the baked-in snapshot
(`src/data/seed.json`, pulled live from the legacy CRM's database on
2026-07-06). The header shows which mode you're in.

## Supabase setup (dedicated project)

This app uses its own Supabase project — deliberately **not** the old CRM's
project, so the two never fight over data.

1. Create a new project at [supabase.com](https://supabase.com).
2. In the SQL editor, run `supabase/schema.sql` (creates the `firms` table —
   one row per firm, so concurrent edits to different firms can't clobber
   each other, unlike the old single-JSON-blob model).
3. Create the team's login accounts (see **Signing in** above).
4. Set env vars (locally in `.env.local`, and in Netlify → Site settings →
   Environment variables):

   ```
   VITE_SUPABASE_URL=https://<project>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon key>
   ```

5. On first load with an empty table the app pushes the baked-in seed up
   automatically (sign in first — the database requires it). From then on
   Supabase is the source of truth.

## Deploying

The app is a static build (`npm run build` → `dist/`) — it needs no server
of its own. It deploys to **Cloudflare Workers** (static assets), driven by
the committed `wrangler.jsonc`:

1. Cloudflare dashboard → **Workers & Pages → Create → Connect to Git** →
   select `moonlitdrifter93/the-nest-crm`.
2. Build command `npm run build`, deploy command `npx wrangler deploy`.
3. Set the two `VITE_SUPABASE_*` env vars as **build** variables
   (worker Settings → **Build** → Variables and secrets). Vite bakes them
   in at build time — runtime worker variables have no effect on a static
   bundle, so they must live in the build section.
4. Add the domain under the worker's **Settings → Domains & Routes →
   Add → Custom domain** → `crm.thenest.com.au` — with the zone already on
   Cloudflare the record and certificate are created automatically.

Every push to `main` deploys. Do not add a `public/_redirects` file — SPA
fallback is `not_found_handling` in `wrangler.jsonc`, and Workers rejects
the `/* /index.html 200` rule as a redirect loop. (`netlify.toml` is kept
so Netlify remains a drop-in alternative.)

## Platform sync (Live funds page)

Fund identities on The Nest are revealed to investors only through paid
reveals, so the CRM never exposes a public read path into the platform
database. Instead, `scripts/sync-platform.mjs` mirrors the live-fund list
into the CRM's own (sign-in-protected) database using service keys that
stay on your machine:

```bash
PLATFORM_SUPABASE_URL=https://<platform-project>.supabase.co \
PLATFORM_SERVICE_ROLE_KEY=<platform service_role key> \
CRM_SUPABASE_URL=https://zgrlfejlakjwqhhgftrp.supabase.co \
CRM_SERVICE_ROLE_KEY=<crm service_role key> \
node scripts/sync-platform.mjs
```

Both `service_role` keys are under each project's **Project Settings → API**.
Run it whenever you want the Live funds page refreshed (or wire it to a
scheduled Supabase Edge Function later). Requires `supabase/
upgrade-001-spif-platform.sql` to have been run once in the CRM project.

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
  with @thenest.com.au accounts (replacing Supabase email/password with
  single sign-on), log emails against firms (match on contact email domain),
  and push follow-ups to Outlook calendar.
- Calendar / SPIF tracker / documents tabs from the old CRM as needed.
