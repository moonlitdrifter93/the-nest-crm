import {
  PublicClientApplication,
  type AccountInfo,
  InteractionRequiredAuthError,
} from "@azure/msal-browser";

/*
 * Microsoft 365 / Outlook integration via MSAL (delegated, per-user).
 *
 * Each CRM user connects their own @thenest.com.au mailbox. Tokens live in
 * the browser session only; the CRM never stores mail server-side. Powers:
 *   - recent emails with a firm's contacts (Mail.Read)
 *   - pushing a follow-up to the user's Outlook calendar (Calendars.ReadWrite)
 *
 * Azure app registration: single-tenant SPA, redirect URI = app origin,
 * delegated Graph perms User.Read / Mail.Read / Calendars.ReadWrite with
 * admin consent granted.
 */

// Client and tenant IDs are public identifiers (not secrets), safe to bake in.
// Override via env if the Azure app registration ever changes.
const CLIENT_ID =
  (import.meta.env.VITE_MS_CLIENT_ID as string | undefined) ||
  "57cc788f-08f9-41f6-b260-7f3a08172225";
const TENANT_ID =
  (import.meta.env.VITE_MS_TENANT_ID as string | undefined) ||
  "e29a371b-3e9d-4101-b163-919167ac316d";

export const outlookConfigured = Boolean(CLIENT_ID && TENANT_ID);

const SCOPES = ["User.Read", "Mail.Read", "Calendars.ReadWrite"];

let pca: PublicClientApplication | null = null;
let initPromise: Promise<PublicClientApplication> | null = null;

async function app(): Promise<PublicClientApplication> {
  if (pca) return pca;
  if (!initPromise) {
    initPromise = (async () => {
      const instance = new PublicClientApplication({
        auth: {
          clientId: CLIENT_ID!,
          authority: `https://login.microsoftonline.com/${TENANT_ID}`,
          redirectUri: window.location.origin,
        },
        cache: { cacheLocation: "sessionStorage" },
      });
      await instance.initialize();
      pca = instance;
      return instance;
    })();
  }
  return initPromise;
}

export function connectedAccount(): AccountInfo | null {
  return pca?.getAllAccounts()[0] ?? null;
}

export async function restoreOutlook(): Promise<AccountInfo | null> {
  if (!outlookConfigured) return null;
  const instance = await app();
  return instance.getAllAccounts()[0] ?? null;
}

export async function connectOutlook(): Promise<AccountInfo> {
  const instance = await app();
  const res = await instance.loginPopup({ scopes: SCOPES, prompt: "select_account" });
  instance.setActiveAccount(res.account);
  return res.account;
}

export async function disconnectOutlook(): Promise<void> {
  const instance = await app();
  const account = instance.getAllAccounts()[0];
  if (account) await instance.logoutPopup({ account });
  pca = null;
  initPromise = null;
}

async function token(): Promise<string> {
  const instance = await app();
  const account = instance.getAllAccounts()[0];
  if (!account) throw new Error("Outlook not connected");
  try {
    const res = await instance.acquireTokenSilent({ scopes: SCOPES, account });
    return res.accessToken;
  } catch (e) {
    if (e instanceof InteractionRequiredAuthError) {
      const res = await instance.acquireTokenPopup({ scopes: SCOPES, account });
      return res.accessToken;
    }
    throw e;
  }
}

async function graph<T>(path: string, init?: RequestInit): Promise<T> {
  const t = await token();
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${t}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`Graph ${path}: ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

export interface OutlookMessage {
  id: string;
  subject: string;
  from: string;
  fromName: string;
  received: string;
  preview: string;
  webLink: string;
  incoming: boolean;
}

// Recent messages exchanged with any of the given email addresses.
export async function emailsWith(addresses: string[]): Promise<OutlookMessage[]> {
  const clean = addresses.map((a) => a.trim().toLowerCase()).filter(Boolean);
  if (!clean.length) return [];
  const me = connectedAccount()?.username?.toLowerCase() ?? "";
  // Graph $search matches participants; quote each address.
  const search = clean.map((a) => `"${a}"`).join(" OR ");
  const data = await graph<{ value: Array<Record<string, any>> }>(
    `/me/messages?$search=${encodeURIComponent(search)}&$top=15&$select=subject,from,toRecipients,receivedDateTime,bodyPreview,webLink`,
    { headers: { ConsistencyLevel: "eventual" } },
  );
  return (data.value ?? []).map((m) => {
    const fromAddr = (m.from?.emailAddress?.address ?? "").toLowerCase();
    return {
      id: m.id,
      subject: m.subject || "(no subject)",
      from: fromAddr,
      fromName: m.from?.emailAddress?.name ?? fromAddr,
      received: m.receivedDateTime,
      preview: m.bodyPreview ?? "",
      webLink: m.webLink,
      incoming: fromAddr !== me,
    };
  });
}

// Create an Outlook calendar event for a firm follow-up.
export async function addFollowupEvent(
  firmName: string,
  dateISO: string,
  note: string,
  attendee?: string,
): Promise<void> {
  const start = `${dateISO}T09:00:00`;
  const end = `${dateISO}T09:30:00`;
  await graph("/me/events", {
    method: "POST",
    body: JSON.stringify({
      subject: `Follow up: ${firmName}`,
      body: { contentType: "text", content: note || `Follow-up with ${firmName} (from The Nest CRM).` },
      start: { dateTime: start, timeZone: "Australia/Sydney" },
      end: { dateTime: end, timeZone: "Australia/Sydney" },
      ...(attendee
        ? { attendees: [{ emailAddress: { address: attendee }, type: "optional" }] }
        : {}),
      reminderMinutesBeforeStart: 30,
    }),
  });
}
