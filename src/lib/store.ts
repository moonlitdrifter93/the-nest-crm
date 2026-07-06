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

const SB_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

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
