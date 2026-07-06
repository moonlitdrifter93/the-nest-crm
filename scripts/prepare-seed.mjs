#!/usr/bin/env node
/*
 * Rebuild src/data/seed.json from a raw CRM JSON export.
 *
 *   node scripts/prepare-seed.mjs path/to/export.json
 *
 * Deduplicates by firm name (keeps the entry with the most substance:
 * non-Dead status, has a follow-up, longest note), renames legacy "Hot"
 * status to "Active", and assigns stable slug ids.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const input = process.argv[2];
if (!input) {
  console.error("Usage: node scripts/prepare-seed.mjs <export.json>");
  process.exit(1);
}

const raw = JSON.parse(readFileSync(input, "utf8"));

const byName = new Map();
for (const d of raw) {
  const name = d.name ?? "";
  if (!byName.has(name)) byName.set(name, []);
  byName.get(name).push(d);
}

const substance = (d) =>
  (d.status !== "Dead" ? 10 : 0) + (d.followup ? 5 : 0) + (d.note?.length ?? 0) / 100;

const slugify = (name) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "firm";

const seen = new Set();
const clean = [];
for (const entries of byName.values()) {
  const d =
    entries.length === 1
      ? entries[0]
      : entries.reduce((a, b) => (substance(b) > substance(a) ? b : a));
  if (d.status === "Hot") d.status = "Active";
  let id = slugify(d.name ?? "");
  for (let i = 2; seen.has(id); i++) id = `${slugify(d.name ?? "")}-${i}`;
  seen.add(id);
  clean.push({ ...d, id });
}

clean.sort((a, b) => (a.name ?? "").toLowerCase().localeCompare((b.name ?? "").toLowerCase()));

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "data", "seed.json");
writeFileSync(out, JSON.stringify(clean));
console.log(`Wrote ${clean.length} firms (${raw.length - clean.length} duplicates merged) to ${out}`);
