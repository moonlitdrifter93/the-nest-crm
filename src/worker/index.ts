import { closeQueue, type ScoredFirm } from "../lib/score";
import type { Firm } from "../types";

/*
 * Scheduled worker — runs daily at 22:30 UTC (= 8:30am AEST).
 *
 *  1. Platform sync: mirrors live funds from The Nest production DB into the
 *     CRM's platform_funds table (when platform secrets are set).
 *  2. Morning digest emails via Resend:
 *       Matthew — team-wide top call list + pipeline stats.
 *       Raph    — his top call list + 5 dripped data-hygiene fixes.
 *  3. Monday (AEST): full firms backup attached to Matthew's email.
 *
 * Secrets (worker Settings → Variables and secrets):
 *   CRM_SERVICE_ROLE_KEY   required — CRM Supabase service key
 *   RESEND_API_KEY         required — for sending
 *   PLATFORM_SUPABASE_URL / PLATFORM_SERVICE_ROLE_KEY  optional — enables sync
 *   DIGEST_TEST_TOKEN      optional — GET /__digest?token=... triggers a run
 *   MAIL_FROM              optional — default "The Nest CRM <onboarding@auth.thenest.com.au>"
 */

interface Env {
  CRM_SUPABASE_URL?: string;
  CRM_SERVICE_ROLE_KEY?: string;
  RESEND_API_KEY?: string;
  PLATFORM_SUPABASE_URL?: string;
  PLATFORM_SERVICE_ROLE_KEY?: string;
  DIGEST_TEST_TOKEN?: string;
  MAIL_FROM?: string;
}

const DEFAULT_CRM_URL = "https://zgrlfejlakjwqhhgftrp.supabase.co";
const DEFAULT_FROM = "The Nest CRM <onboarding@auth.thenest.com.au>";
const CRM_LINK = "https://crm.thenest.com.au";

const RECIPIENTS = [
  { name: "Matthew Downing", email: "matthew.downing@thenest.com.au", admin: true },
  { name: "Raphael Pitts", email: "raph.pitts@thenest.com.au", admin: false },
];

async function rest(base: string, key: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`${base}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status} ${await res.text()}`);
  // PostgREST writes (and 204s) can return an empty body — parse only if present.
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function syncPlatform(env: Env, crmUrl: string, crmKey: string): Promise<string> {
  if (!env.PLATFORM_SUPABASE_URL || !env.PLATFORM_SERVICE_ROLE_KEY) {
    return "platform sync skipped (secrets not set)";
  }
  const pUrl = env.PLATFORM_SUPABASE_URL;
  const pKey = env.PLATFORM_SERVICE_ROLE_KEY;
  const firms = (await rest(
    pUrl,
    pKey,
    "firms?select=id,name,is_enterprise,head_office_city,current_fum_value&is_archived=eq.false",
  )) as Array<Record<string, unknown>>;
  const products = (await rest(
    pUrl,
    pKey,
    "fund_products?select=firm_id,is_visible_for_investors,asset_class_names&is_archived=eq.false&status=eq.approved",
  )) as Array<{ firm_id: number; is_visible_for_investors: boolean; asset_class_names: string }>;

  const byFirm = new Map<number, { approved: number; live: number; classes: Set<string> }>();
  for (const p of products) {
    const agg = byFirm.get(p.firm_id) ?? { approved: 0, live: 0, classes: new Set<string>() };
    agg.approved += 1;
    if (p.is_visible_for_investors) agg.live += 1;
    for (const c of (p.asset_class_names || "").split(",")) {
      const t = c.trim();
      if (t) agg.classes.add(t);
    }
    byFirm.set(p.firm_id, agg);
  }
  const rows = firms
    .filter((f) => byFirm.has(f.id as number))
    .map((f) => {
      const agg = byFirm.get(f.id as number)!;
      return {
        firm_id: f.id,
        firm_name: f.name,
        is_enterprise: f.is_enterprise,
        head_office_city: f.head_office_city ?? null,
        fum: f.current_fum_value ?? null,
        approved_products: agg.approved,
        live_products: agg.live,
        asset_classes: [...agg.classes].sort().join(", ") || null,
        synced_at: new Date().toISOString(),
      };
    });
  await rest(crmUrl, crmKey, "platform_funds?firm_id=gte.0", { method: "DELETE" });
  if (rows.length) {
    await rest(crmUrl, crmKey, "platform_funds", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(rows),
    });
  }
  return `platform sync: ${rows.length} live funds`;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function callRows(list: ScoredFirm[]): string {
  return list
    .map((s, i) => {
      const f = s.firm;
      const phone = f.phone?.trim() || f.contacts?.find((c) => c.phone?.trim())?.phone || "";
      const email = f.email?.trim() || f.contacts?.find((c) => c.email?.trim())?.email || "";
      return `<tr>
        <td style="padding:8px 10px;color:#788072;">${i + 1}</td>
        <td style="padding:8px 10px;"><b>${esc(f.name)}</b><br>
          <span style="color:#788072;font-size:12px;">${esc(f.status)}${f.plan ? " · " + f.plan : ""} · ${esc(f.owner || "—")} · score ${s.score}</span></td>
        <td style="padding:8px 10px;">${esc(f.contact || "")}<br>
          ${phone ? `<a href="tel:${esc(phone.replace(/\s+/g, ""))}" style="color:#c8a86a;font-weight:bold;">${esc(phone)}</a><br>` : ""}
          ${email ? `<a href="mailto:${esc(email)}" style="color:#c8a86a;">${esc(email)}</a>` : ""}</td>
        <td style="padding:8px 10px;font-size:12px;color:#4a5248;">${esc(f.action || "")}</td>
      </tr>`;
    })
    .join("");
}

function emailShell(title: string, body: string): string {
  return `<div style="font-family:Georgia,serif;max-width:680px;margin:0 auto;">
    <h1 style="color:#1e2d22;">The Nest — ${esc(title)}</h1>
    ${body}
    <p style="margin-top:24px;"><a href="${CRM_LINK}" style="color:#c8a86a;font-weight:bold;">Open the CRM →</a></p>
  </div>`;
}

async function sendEmail(
  env: Env,
  to: string,
  subject: string,
  html: string,
  attachment?: { filename: string; content: string },
) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.MAIL_FROM || DEFAULT_FROM,
      to: [to],
      subject,
      html,
      ...(attachment ? { attachments: [attachment] } : {}),
    }),
  });
  if (!res.ok) throw new Error(`resend to ${to}: HTTP ${res.status} ${await res.text()}`);
}

function toBase64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

async function runDigest(env: Env): Promise<string> {
  const crmUrl = env.CRM_SUPABASE_URL || DEFAULT_CRM_URL;
  const crmKey = env.CRM_SERVICE_ROLE_KEY;
  if (!crmKey) return "missing CRM_SERVICE_ROLE_KEY";
  if (!env.RESEND_API_KEY) return "missing RESEND_API_KEY";

  const log: string[] = [];
  const rows = (await rest(crmUrl, crmKey, "firms?select=id,name,data")) as Array<{
    id: string;
    name: string;
    data: Firm;
  }>;
  const firms: Firm[] = rows.map((r) => ({ ...r.data, id: r.id, name: r.name }));
  log.push(`${firms.length} firms loaded`);

  try {
    log.push(await syncPlatform(env, crmUrl, crmKey));
  } catch (e) {
    log.push(`platform sync failed: ${e instanceof Error ? e.message : e}`);
  }

  const queue = closeQueue(firms);
  const aestNow = new Date(Date.now() + 10 * 3600_000);
  const isMondayAEST = aestNow.getUTCDay() === 1;
  const dateStr = aestNow.toISOString().slice(0, 10);

  const overdue = firms.filter((f) => {
    if (f.status === "Dead" || f.status === "Not Now") return false;
    return f.followup !== undefined && f.followup !== "" && f.followup < dateStr;
  }).length;
  const untouched = queue.filter((s) => !s.firm.last_contact).length;

  for (const r of RECIPIENTS) {
    const mine = queue.filter((s) => s.firm.owner === r.name);
    let body: string;
    let subject: string;
    let attachment: { filename: string; content: string } | undefined;

    if (r.admin) {
      subject = `Call sheet & pipeline — ${dateStr}`;
      body = `
        <p><b>${queue.length}</b> firms in play · <b>${overdue}</b> overdue follow-ups · <b>${untouched}</b> never contacted.</p>
        <h3 style="color:#1e2d22;">Team top 15 to close</h3>
        <table style="border-collapse:collapse;width:100%;">${callRows(queue.slice(0, 15))}</table>
        <h3 style="color:#1e2d22;">Your top 10</h3>
        <table style="border-collapse:collapse;width:100%;">${callRows(mine.slice(0, 10))}</table>`;
      if (isMondayAEST) {
        attachment = {
          filename: `nest-crm-backup-${dateStr}.json`,
          content: toBase64(JSON.stringify(firms)),
        };
        body += `<p style="color:#788072;">Weekly backup of all ${firms.length} firms attached.</p>`;
      }
    } else {
      subject = `Your call sheet — ${dateStr}`;
      // dripped data-hygiene fixes: 5 per day, rotating
      const broken = firms
        .filter(
          (f) =>
            f.owner === r.name &&
            (f.status === "Active" || f.status === "Engaged" || f.status === "Prospecting") &&
            (!f.email?.trim() || !f.phone?.trim() || !(f.asset_classes ?? []).length),
        )
        .sort((a, b) => a.name.localeCompare(b.name));
      const dayIdx = Math.floor(Date.now() / 86_400_000);
      const fixes: Firm[] = [];
      for (let i = 0; i < Math.min(5, broken.length); i++) {
        fixes.push(broken[(dayIdx * 5 + i) % broken.length]);
      }
      const fixRows = fixes
        .map((f) => {
          const missing = [
            !f.email?.trim() ? "email" : "",
            !f.phone?.trim() ? "phone" : "",
            !(f.asset_classes ?? []).length ? "asset classes" : "",
          ]
            .filter(Boolean)
            .join(", ");
          return `<li><b>${esc(f.name)}</b> — missing ${missing}</li>`;
        })
        .join("");
      body = `
        <h3 style="color:#1e2d22;">Your top 15 to close today</h3>
        <table style="border-collapse:collapse;width:100%;">${callRows(mine.slice(0, 15))}</table>
        ${fixes.length ? `<h3 style="color:#1e2d22;">Today's 5 data fixes</h3><ul>${fixRows}</ul><p style="color:#788072;font-size:13px;">Filling these in sharpens your call list scoring.</p>` : ""}`;
    }

    try {
      await sendEmail(env, r.email, subject, emailShell(subject, body), attachment);
      log.push(`sent to ${r.email}`);
    } catch (e) {
      log.push(`send failed for ${r.email}: ${e instanceof Error ? e.message : e}`);
    }
  }
  return log.join("\n");
}

export default {
  async scheduled(_controller: unknown, env: Env): Promise<void> {
    console.log(await runDigest(env));
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    // Unauthenticated: reports WHICH runtime secrets are set (booleans only,
    // never the values) so misconfiguration is easy to diagnose.
    if (url.pathname === "/__health") {
      return Response.json({
        CRM_SERVICE_ROLE_KEY: Boolean(env.CRM_SERVICE_ROLE_KEY),
        RESEND_API_KEY: Boolean(env.RESEND_API_KEY),
        DIGEST_TEST_TOKEN: Boolean(env.DIGEST_TEST_TOKEN),
        PLATFORM_SUPABASE_URL: Boolean(env.PLATFORM_SUPABASE_URL),
        PLATFORM_SERVICE_ROLE_KEY: Boolean(env.PLATFORM_SERVICE_ROLE_KEY),
      });
    }
    if (url.pathname === "/__digest") {
      if (!env.DIGEST_TEST_TOKEN || url.searchParams.get("token") !== env.DIGEST_TEST_TOKEN) {
        return new Response("forbidden", { status: 403 });
      }
      return new Response(await runDigest(env));
    }
    // Create a partner's login account. Team-only: the caller's Supabase
    // access token must belong to a team member. Uses the service key
    // (server-side) so no admin credential ever touches the browser.
    if (url.pathname === "/__admin/create-partner" && request.method === "POST") {
      return createPartner(request, env);
    }
    return new Response("not found", { status: 404 });
  },
};

const TEAM_EMAILS = new Set(RECIPIENTS.map((r) => r.email.toLowerCase()));

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function createPartner(request: Request, env: Env): Promise<Response> {
  const crmUrl = env.CRM_SUPABASE_URL || DEFAULT_CRM_URL;
  const key = env.CRM_SERVICE_ROLE_KEY;
  if (!key) return json({ error: "Server not configured (missing service key)." }, 500);

  // 1. Verify the caller is a signed-in team member.
  const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Not signed in." }, 401);
  const whoRes = await fetch(`${crmUrl}/auth/v1/user`, {
    headers: { apikey: key, Authorization: `Bearer ${token}` },
  });
  if (!whoRes.ok) return json({ error: "Session invalid." }, 401);
  const who = (await whoRes.json()) as { email?: string };
  if (!who.email || !TEAM_EMAILS.has(who.email.toLowerCase())) {
    return json({ error: "Only The Nest team can create partner logins." }, 403);
  }

  // 2. Create the auth user with the service key.
  const body = (await request.json().catch(() => ({}))) as { email?: string; password?: string };
  if (!body.email || !body.password) return json({ error: "Email and password required." }, 400);
  const createRes = await fetch(`${crmUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email: body.email, password: body.password, email_confirm: true }),
  });
  if (!createRes.ok) {
    const txt = await createRes.text();
    if (/already.*registered|already exists|duplicate/i.test(txt)) {
      return json({ error: "A login already exists for that email." }, 409);
    }
    return json({ error: `Could not create login: ${txt}` }, 400);
  }
  return json({ ok: true });
}
