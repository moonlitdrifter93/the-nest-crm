import { client, supabaseEnabled } from "./store";

/*
 * Partner portal data layer. All access is enforced at the database level by
 * row-level security (upgrade-005): partners only ever see their own rows;
 * the team sees everything. These helpers are thin wrappers over Supabase.
 */

export interface Partner {
  id: string;
  email: string;
  name: string;
  company?: string;
  phone?: string;
  fee_terms?: string;
  is_active?: boolean;
  created_at?: string;
}

export type IntroKind = "investor" | "fund_manager";
export type IntroStatus = "Submitted" | "In progress" | "Met" | "Converted" | "Declined";
export type FeeStatus = "Pending" | "Agreed" | "Invoiced" | "Paid" | "N/A";

export interface PartnerIntro {
  id?: number;
  partner_id: string;
  kind: IntroKind;
  name: string;
  contact_email?: string;
  contact_note?: string;
  firm_id?: string | null;
  status: IntroStatus;
  fee_amount?: number | null;
  fee_status: FeeStatus;
  team_note?: string;
  created_at?: string;
  updated_at?: string;
  // joined for the team view
  partners?: { name: string } | null;
}

export interface PartnerEvent {
  id?: number;
  partner_id: string;
  title: string;
  event_date?: string;
  kind?: string;
  location?: string;
  notes?: string;
  created_at?: string;
  partners?: { name: string } | null;
}

/* ---------- current partner (portal side) ---------- */

export async function loadMyPartner(email: string): Promise<Partner | null> {
  if (!supabaseEnabled) return null;
  const { data, error } = await client()
    .from("partners")
    .select("*")
    .ilike("email", email)
    .maybeSingle();
  if (error) return null;
  return (data as Partner) ?? null;
}

/* ---------- partners (team side) ---------- */

export async function loadPartners(): Promise<Partner[]> {
  if (!supabaseEnabled) return [];
  const { data, error } = await client().from("partners").select("*").order("name");
  if (error) return [];
  return (data ?? []) as Partner[];
}

// Create the partner's Supabase Auth login via the server-side worker
// (team-only, uses the service key that never touches the browser).
export async function createPartnerLogin(email: string, password: string): Promise<void> {
  const { data } = await client().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not signed in.");
  const res = await fetch("/__admin/create-partner", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ email, password }),
  });
  const j = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(j.error || "Could not create login.");
}

export async function savePartner(p: Partial<Partner> & { email: string; name: string }): Promise<void> {
  const row = {
    email: p.email,
    name: p.name,
    company: p.company ?? null,
    phone: p.phone ?? null,
    fee_terms: p.fee_terms ?? null,
    is_active: p.is_active ?? true,
  };
  const q = client().from("partners");
  const { error } = p.id ? await q.update(row).eq("id", p.id) : await q.insert(row);
  if (error) throw new Error(`Save partner failed: ${error.message}`);
}

/* ---------- introductions ---------- */

// Partner side: only their own rows come back (RLS). Team side: all, with the
// partner name joined.
export async function loadIntros(forTeam: boolean): Promise<PartnerIntro[]> {
  if (!supabaseEnabled) return [];
  const sel = forTeam ? "*, partners(name)" : "*";
  const { data, error } = await client()
    .from("partner_intros")
    .select(sel)
    .order("created_at", { ascending: false });
  if (error) return [];
  return (data ?? []) as unknown as PartnerIntro[];
}

export async function submitIntro(
  intro: Pick<PartnerIntro, "partner_id" | "kind" | "name" | "contact_email" | "contact_note">,
): Promise<void> {
  const { error } = await client().from("partner_intros").insert({
    partner_id: intro.partner_id,
    kind: intro.kind,
    name: intro.name,
    contact_email: intro.contact_email ?? null,
    contact_note: intro.contact_note ?? null,
    status: "Submitted",
  });
  if (error) throw new Error(`Submit failed: ${error.message}`);
}

// Team-only: update status / fees / link firm / note.
export async function updateIntro(intro: PartnerIntro): Promise<void> {
  const { error } = await client()
    .from("partner_intros")
    .update({
      status: intro.status,
      fee_amount: intro.fee_amount ?? null,
      fee_status: intro.fee_status,
      firm_id: intro.firm_id ?? null,
      team_note: intro.team_note ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", intro.id);
  if (error) throw new Error(`Update failed: ${error.message}`);
}

/* ---------- events ---------- */

export async function loadPartnerEvents(forTeam: boolean): Promise<PartnerEvent[]> {
  if (!supabaseEnabled) return [];
  const sel = forTeam ? "*, partners(name)" : "*";
  const { data, error } = await client()
    .from("partner_events")
    .select(sel)
    .order("event_date", { ascending: false });
  if (error) return [];
  return (data ?? []) as unknown as PartnerEvent[];
}

export async function logPartnerEvent(
  ev: Pick<PartnerEvent, "partner_id" | "title" | "event_date" | "kind" | "location" | "notes">,
): Promise<void> {
  const { error } = await client().from("partner_events").insert({
    partner_id: ev.partner_id,
    title: ev.title,
    event_date: ev.event_date || null,
    kind: ev.kind ?? null,
    location: ev.location ?? null,
    notes: ev.notes ?? null,
  });
  if (error) throw new Error(`Log event failed: ${error.message}`);
}

export async function deletePartnerEvent(id: number): Promise<void> {
  const { error } = await client().from("partner_events").delete().eq("id", id);
  if (error) throw new Error(`Delete failed: ${error.message}`);
}

// Admin: create an introduction on a partner's behalf (allocate).
export async function adminAddIntro(
  intro: Pick<PartnerIntro, "partner_id" | "kind" | "name" | "contact_email" | "contact_note" | "status">,
): Promise<void> {
  const { error } = await client().from("partner_intros").insert({
    partner_id: intro.partner_id,
    kind: intro.kind,
    name: intro.name,
    contact_email: intro.contact_email ?? null,
    contact_note: intro.contact_note ?? null,
    status: intro.status,
  });
  if (error) throw new Error(`Add failed: ${error.message}`);
}

/* ---------- collateral ---------- */

export interface Collateral {
  id?: number;
  name: string;
  description?: string;
  path: string;
  size?: number;
  content_type?: string;
  partner_visible: boolean;
  uploaded_by?: string;
  created_at?: string;
}

export async function loadCollateral(): Promise<Collateral[]> {
  if (!supabaseEnabled) return [];
  const { data, error } = await client()
    .from("collateral")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return [];
  return (data ?? []) as Collateral[];
}

export async function uploadCollateral(
  file: File,
  meta: { name: string; description?: string; partner_visible: boolean; uploaded_by: string },
): Promise<void> {
  const prefix = meta.partner_visible ? "partner" : "internal";
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${prefix}/${Date.now()}-${safe}`;
  const up = await client().storage.from("collateral").upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  });
  if (up.error) throw new Error(`Upload failed: ${up.error.message}`);
  const { error } = await client().from("collateral").insert({
    name: meta.name,
    description: meta.description ?? null,
    path,
    size: file.size,
    content_type: file.type || null,
    partner_visible: meta.partner_visible,
    uploaded_by: meta.uploaded_by,
  });
  if (error) throw new Error(`Save collateral failed: ${error.message}`);
}

export async function collateralUrl(path: string): Promise<string | null> {
  if (!supabaseEnabled) return null;
  const { data, error } = await client().storage.from("collateral").createSignedUrl(path, 3600);
  if (error) return null;
  return data.signedUrl;
}

export async function deleteCollateral(item: Collateral): Promise<void> {
  await client().storage.from("collateral").remove([item.path]);
  const { error } = await client().from("collateral").delete().eq("id", item.id);
  if (error) throw new Error(`Delete failed: ${error.message}`);
}
