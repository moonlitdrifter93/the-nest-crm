#!/usr/bin/env node
/*
 * Mirror the live fund list from The Nest's production Supabase into the
 * CRM's Supabase (table platform_funds), so the Live Funds page shows real
 * platform data.
 *
 * Run locally (never from the browser — uses service-role keys):
 *
 *   PLATFORM_SUPABASE_URL=https://<platform-project>.supabase.co \
 *   PLATFORM_SERVICE_ROLE_KEY=<platform service_role key> \
 *   CRM_SUPABASE_URL=https://zgrlfejlakjwqhhgftrp.supabase.co \
 *   CRM_SERVICE_ROLE_KEY=<crm service_role key> \
 *   node scripts/sync-platform.mjs
 *
 * Why a script and not a live cross-database view: fund identities on The
 * Nest are revealed to investors only through paid reveals. Exposing a
 * public view of live fund names would leak that. This script runs with
 * admin keys on a trusted machine and lands the data behind the CRM's own
 * sign-in.
 */

const PLATFORM_URL = need("PLATFORM_SUPABASE_URL");
const PLATFORM_KEY = need("PLATFORM_SERVICE_ROLE_KEY");
const CRM_URL = need("CRM_SUPABASE_URL");
const CRM_KEY = need("CRM_SERVICE_ROLE_KEY");

function need(name) {
  const v = process.env[name]?.trim();
  if (!v) {
    console.error(`Missing env var ${name} — see the header of this script for usage.`);
    process.exit(1);
  }
  return v;
}

async function rest(base, key, path, init = {}) {
  const res = await fetch(`${base}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status} ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// uid -> email for the platform's internal accounts, so allocation can be
// filtered per person (Raph only sees the funds allocated to him).
async function loadPlatformUsers() {
  const res = await fetch(`${PLATFORM_URL}/auth/v1/admin/users?per_page=500`, {
    headers: { apikey: PLATFORM_KEY, Authorization: `Bearer ${PLATFORM_KEY}` },
  });
  const map = new Map();
  if (!res.ok) return map;
  const data = await res.json();
  for (const u of data.users ?? []) if (u.email) map.set(u.id, u.email);
  return map;
}

// 1. Pull firms and ALL non-archived products (draft, signed_off, approved).
const firms = await rest(
  PLATFORM_URL,
  PLATFORM_KEY,
  "firms?select=id,name,is_enterprise,head_office_city,current_fum_value&is_archived=eq.false",
);
const products = await rest(
  PLATFORM_URL,
  PLATFORM_KEY,
  "fund_products?select=firm_id,status,is_visible_for_investors,asset_class_names,onboarded_by_auth_user_uid&is_archived=eq.false",
);

// Who is allocated to each firm on the platform (firm-level sub-admins).
const allocs = await rest(
  PLATFORM_URL,
  PLATFORM_KEY,
  "firm_sub_admin_allocations?select=firm_id,sub_admin_auth_user_uid",
);
const uidEmail = await loadPlatformUsers();

const firmEmails = new Map();
const addEmail = (firmId, uid) => {
  const email = uid ? uidEmail.get(uid) : undefined;
  if (!email) return;
  const s = firmEmails.get(firmId) ?? new Set();
  s.add(email.toLowerCase());
  firmEmails.set(firmId, s);
};
for (const a of allocs) addEmail(a.firm_id, a.sub_admin_auth_user_uid);
for (const p of products) addEmail(p.firm_id, p.onboarded_by_auth_user_uid);

// 2. Aggregate approved/draft/live products per firm.
const byFirm = new Map();
for (const p of products) {
  const agg = byFirm.get(p.firm_id) ?? { approved: 0, live: 0, draft: 0, classes: new Set() };
  if (p.status === "approved") agg.approved += 1;
  else agg.draft += 1; // draft + signed_off
  if (p.is_visible_for_investors) agg.live += 1;
  for (const c of (p.asset_class_names || "").split(",")) {
    const t = c.trim();
    if (t) agg.classes.add(t);
  }
  byFirm.set(p.firm_id, agg);
}

const rows = firms
  .filter((f) => byFirm.has(f.id))
  .map((f) => {
    const agg = byFirm.get(f.id);
    return {
      firm_id: f.id,
      firm_name: f.name,
      is_enterprise: f.is_enterprise,
      head_office_city: f.head_office_city ?? null,
      fum: f.current_fum_value ?? null,
      approved_products: agg.approved,
      live_products: agg.live,
      draft_products: agg.draft,
      asset_classes: [...agg.classes].sort().join(", ") || null,
      owner_emails: [...(firmEmails.get(f.id) ?? [])].sort().join(",") || null,
      synced_at: new Date().toISOString(),
    };
  });

console.log(`Platform: ${firms.length} firms, ${products.length} products (incl. drafts) → ${rows.length} fund rows.`);

// 3. Replace the mirror in the CRM project.
await rest(CRM_URL, CRM_KEY, "platform_funds?firm_id=gte.0", { method: "DELETE" });
if (rows.length) {
  await rest(CRM_URL, CRM_KEY, "platform_funds", {
    method: "POST",
    body: JSON.stringify(rows),
  });
}
console.log(`Synced ${rows.length} funds into the CRM's platform_funds table.`);
