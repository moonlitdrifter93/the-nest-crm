import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import seedRaw from "../data/seed.json";
import type { Firm } from "../types";

/*
 * Data layer.
 *
 * Supabase mode (VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY set):
 *   one row per firm in `firms` — saves upsert a single row, so two people
 *   editing different firms can never clobber each other (unlike the old
 *   single-JSON-blob CRM). If the table is empty on first load, the baked-in
 *   seed is pushed up automatically.
 *
 * Local mode (no env vars): localStorage seeded from the baked-in JSON.
 *   Lets the app run before the new Supabase project is provisioned.
 */

const SEED = seedRaw as unknown as Firm[];
const LOCAL_KEY = "nest_crm_v2_local";

// Sanitise env values: strip whitespace/newlines that ride along in copy/paste.
const RAW_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const RAW_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.replace(/\s+/g, "");

// Keys are base64url segments (JWT) or sb_publishable_* — anything else means a
// corrupted paste (smart quote, ellipsis, invisible character). A bad key would
// otherwise crash every fetch with an obscure "non ISO-8859-1 code point" error.
const KEY_OK = !!RAW_KEY && /^[A-Za-z0-9_.-]+$/.test(RAW_KEY);

// Surfaced on the sign-in screen when env vars are present but unusable.
export const configError =
  RAW_KEY && !KEY_OK
    ? "The Supabase key set at build time contains an invalid character (copy/paste artifact). Re-copy the anon key from Supabase → Project Settings → API using the copy button, update the VITE_SUPABASE_ANON_KEY build variable, and redeploy."
    : "";

const SB_URL = RAW_URL;
const SB_KEY = KEY_OK ? RAW_KEY : undefined;

export const supabaseEnabled = Boolean(SB_URL && SB_KEY);

let sb: SupabaseClient | null = null;
// Only call when supabaseEnabled; also used by App for Supabase Auth sign-in.
export function client(): SupabaseClient {
  if (!sb) sb = createClient(SB_URL!, SB_KEY!);
  return sb;
}

interface FirmRow {
  id: string;
  name: string;
  data: Firm;
}

export async function loadFirms(): Promise<Firm[]> {
  if (!supabaseEnabled) {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (raw) {
      try {
        return JSON.parse(raw) as Firm[];
      } catch {
        // fall through to seed
      }
    }
    localStorage.setItem(LOCAL_KEY, JSON.stringify(SEED));
    return SEED;
  }

  const { data, error } = await client().from("firms").select("id,name,data");
  if (error) throw new Error(`Supabase load failed: ${error.message}`);

  if (!data || data.length === 0) {
    await pushSeed();
    return SEED;
  }
  return (data as FirmRow[]).map((r) => ({ ...r.data, id: r.id, name: r.name }));
}

async function pushSeed(): Promise<void> {
  const rows: FirmRow[] = SEED.map((f) => ({ id: f.id, name: f.name, data: f }));
  // chunked so we stay under request-size limits
  for (let i = 0; i < rows.length; i += 100) {
    const { error } = await client().from("firms").upsert(rows.slice(i, i + 100));
    if (error) throw new Error(`Seed push failed: ${error.message}`);
  }
}

export async function saveFirm(firm: Firm): Promise<void> {
  if (!supabaseEnabled) {
    const firms = await loadFirms();
    const i = firms.findIndex((f) => f.id === firm.id);
    if (i >= 0) firms[i] = firm;
    else firms.push(firm);
    localStorage.setItem(LOCAL_KEY, JSON.stringify(firms));
    return;
  }
  const { error } = await client()
    .from("firms")
    .upsert({ id: firm.id, name: firm.name, data: firm, updated_at: new Date().toISOString() });
  if (error) throw new Error(`Save failed: ${error.message}`);
}

export async function deleteFirm(id: string): Promise<void> {
  if (!supabaseEnabled) {
    const firms = (await loadFirms()).filter((f) => f.id !== id);
    localStorage.setItem(LOCAL_KEY, JSON.stringify(firms));
    return;
  }
  const { error } = await client().from("firms").delete().eq("id", id);
  if (error) throw new Error(`Delete failed: ${error.message}`);
}

/* ---------- SPIF: closes tracker ---------- */

export interface SpifEvent {
  id?: number;
  ts: string;
  firm_id: string;
  firm_name: string;
  owner?: string;
  kind: "Onboarded" | "Live";
  logged_by?: string;
}

const SPIF_LOCAL_KEY = "nest_crm_spif";

export async function loadSpif(): Promise<SpifEvent[]> {
  if (!supabaseEnabled) {
    try {
      return JSON.parse(localStorage.getItem(SPIF_LOCAL_KEY) || "[]") as SpifEvent[];
    } catch {
      return [];
    }
  }
  const { data, error } = await client()
    .from("spif_events")
    .select("*")
    .order("ts", { ascending: false });
  if (error) throw new Error(`SPIF load failed: ${error.message}`);
  return (data ?? []) as SpifEvent[];
}

export async function logSpif(ev: SpifEvent): Promise<SpifEvent> {
  if (!supabaseEnabled) {
    const all = await loadSpif();
    all.unshift(ev);
    localStorage.setItem(SPIF_LOCAL_KEY, JSON.stringify(all));
    return ev;
  }
  const { data, error } = await client()
    .from("spif_events")
    .insert({
      ts: ev.ts,
      firm_id: ev.firm_id,
      firm_name: ev.firm_name,
      owner: ev.owner ?? null,
      kind: ev.kind,
      logged_by: ev.logged_by ?? null,
    })
    .select()
    .single();
  if (error) throw new Error(`SPIF log failed: ${error.message}`);
  return data as SpifEvent;
}

// Admin-only by database policy (upgrade-003).
export async function updateSpif(ev: SpifEvent): Promise<void> {
  if (!supabaseEnabled) {
    const all = (await loadSpif()).map((e) =>
      (e.id ?? e.ts) === (ev.id ?? ev.ts) ? ev : e,
    );
    localStorage.setItem(SPIF_LOCAL_KEY, JSON.stringify(all));
    return;
  }
  const { error } = await client()
    .from("spif_events")
    .update({
      ts: ev.ts,
      firm_name: ev.firm_name,
      owner: ev.owner ?? null,
      kind: ev.kind,
    })
    .eq("id", ev.id);
  if (error) throw new Error(`SPIF update failed: ${error.message}`);
}

export async function deleteSpif(ev: SpifEvent): Promise<void> {
  if (!supabaseEnabled) {
    const all = (await loadSpif()).filter((e) => e.ts !== ev.ts || e.firm_id !== ev.firm_id);
    localStorage.setItem(SPIF_LOCAL_KEY, JSON.stringify(all));
    return;
  }
  const { error } = await client().from("spif_events").delete().eq("id", ev.id);
  if (error) throw new Error(`SPIF delete failed: ${error.message}`);
}

/* ---------- Master deal book (admin-only, RLS-locked table) ---------- */

import type { Deal } from "../types";

const DEALS_LOCAL_KEY = "nest_crm_deals_v2";

function localDeals(): Deal[] {
  try {
    return JSON.parse(localStorage.getItem(DEALS_LOCAL_KEY) || "[]") as Deal[];
  } catch {
    return [];
  }
}
function setLocalDeals(deals: Deal[]) {
  localStorage.setItem(DEALS_LOCAL_KEY, JSON.stringify(deals));
}

// The deals table's RLS only answers to the admin's email, so for anyone
// else this returns empty — the data never reaches their browser.
export async function loadDeals(): Promise<Deal[]> {
  if (!supabaseEnabled) return localDeals().sort((a, b) => a.position - b.position);
  const { data, error } = await client().from("deals").select("*").order("position");
  if (error) return [];
  return (data ?? []) as Deal[];
}

function dealRow(deal: Deal) {
  return {
    name: deal.name,
    firm_id: deal.firm_id ?? null,
    is_placement: deal.is_placement ?? false,
    plan: deal.plan ?? "",
    amount: deal.amount ?? null,
    update_text: deal.update_text ?? null,
    update_at: deal.update_at ?? null,
    position: deal.position,
    updated_at: new Date().toISOString(),
  };
}

// Returns the deal with its database-assigned id.
export async function createDeal(deal: Deal): Promise<Deal> {
  if (!supabaseEnabled) {
    const withId = { ...deal, id: `local-${Date.now()}` };
    setLocalDeals([...localDeals(), withId]);
    return withId;
  }
  const { data, error } = await client().from("deals").insert(dealRow(deal)).select().single();
  if (error) throw new Error(`Deal create failed: ${error.message}`);
  return data as Deal;
}

export async function updateDeal(deal: Deal): Promise<void> {
  if (!supabaseEnabled) {
    setLocalDeals(localDeals().map((d) => (d.id === deal.id ? deal : d)));
    return;
  }
  const { error } = await client().from("deals").update(dealRow(deal)).eq("id", deal.id);
  if (error) throw new Error(`Deal update failed: ${error.message}`);
}

export async function deleteDeal(id: Deal["id"]): Promise<void> {
  if (!supabaseEnabled) {
    setLocalDeals(localDeals().filter((d) => d.id !== id));
    return;
  }
  const { error } = await client().from("deals").delete().eq("id", id);
  if (error) throw new Error(`Deal delete failed: ${error.message}`);
}

// Persist a drag-reorder: positions are the array order.
export async function reorderDeals(deals: Deal[]): Promise<void> {
  const repositioned = deals.map((d, i) => ({ ...d, position: i }));
  if (!supabaseEnabled) {
    setLocalDeals(repositioned);
    return;
  }
  await Promise.all(
    repositioned.map((d) =>
      client().from("deals").update({ position: d.position }).eq("id", d.id),
    ),
  );
}

/* ---------- Platform live funds (synced from The Nest production) ---------- */

export interface PlatformFund {
  firm_id: number;
  firm_name: string;
  is_enterprise: boolean;
  head_office_city?: string | null;
  fum?: number | null;
  approved_products: number;
  live_products: number;
  asset_classes?: string | null;
  synced_at: string;
}

// Rows are written by scripts/sync-platform.mjs (service keys, never in the
// browser). Empty result = sync has not been run yet.
export async function loadPlatformFunds(): Promise<PlatformFund[]> {
  if (!supabaseEnabled) return [];
  const { data, error } = await client()
    .from("platform_funds")
    .select("*")
    .order("firm_name");
  if (error) return []; // table may not exist yet — treat as not synced
  return (data ?? []) as PlatformFund[];
}

export function newFirmId(name: string, existing: Set<string>): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "firm";
  let id = base;
  let i = 2;
  while (existing.has(id)) id = `${base}-${i++}`;
  return id;
}
