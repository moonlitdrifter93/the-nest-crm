#!/usr/bin/env node
/*
 * Pull the current firm data from the legacy CRM's Supabase and re-bake
 * src/data/seed.json in one step.
 *
 *   node scripts/pull-live.mjs
 *
 * Reads the same row the old single-file CRM syncs to (id='main' in
 * crm_data). Uses the legacy project's publishable key — this is the OLD
 * CRM's project, used read-only here as a migration source. Once the new
 * dedicated Supabase project is the source of truth, this script is only
 * needed for one final cut-over pull.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const LEGACY_URL = process.env.LEGACY_SUPABASE_URL || "https://tjkwxatenqxxdetfamuo.supabase.co";
const LEGACY_KEY =
  process.env.LEGACY_SUPABASE_KEY || "sb_publishable_vhx5MWPpEoIQagWTWROWJA_AUxZHvTJ";

const res = await fetch(`${LEGACY_URL}/rest/v1/crm_data?id=eq.main&select=data`, {
  headers: { apikey: LEGACY_KEY },
});
if (!res.ok) {
  console.error(`Pull failed: HTTP ${res.status} ${await res.text()}`);
  process.exit(1);
}
const rows = await res.json();
if (!rows.length) {
  console.error("No id='main' row found in legacy crm_data.");
  process.exit(1);
}

const tmp = join(mkdtempSync(join(tmpdir(), "nest-pull-")), "live.json");
writeFileSync(tmp, JSON.stringify(rows[0].data));
console.log(`Pulled ${rows[0].data.length} firms from legacy CRM.`);

const here = dirname(fileURLToPath(import.meta.url));
execFileSync("node", [join(here, "prepare-seed.mjs"), tmp], { stdio: "inherit" });
