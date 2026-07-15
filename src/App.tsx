import { useEffect, useMemo, useState } from "react";
import { CallSheet } from "./components/CallSheet";
import { CollateralAdmin } from "./components/CollateralAdmin";
import { FirmDrawer } from "./components/FirmDrawer";
import { PartnersAdmin } from "./components/PartnersAdmin";
import { LiveFundsView } from "./components/LiveFundsView";
import { MasterView } from "./components/MasterView";
import { PipelineView } from "./components/PipelineView";
import { SpifView } from "./components/SpifView";
import { UniverseView } from "./components/UniverseView";
import { isTough } from "./lib/contact";
import { exportExcel } from "./lib/export";
import { daysUntil, todayISO, touchFirm } from "./lib/format";
import {
  connectOutlook,
  disconnectOutlook,
  initOutlook,
  outlookConfigured,
  ssoConnect,
} from "./lib/outlook";
import {
  client,
  configError,
  createDeal,
  deleteDeal,
  deleteFirm,
  deleteSpif,
  loadDeals,
  loadFirms,
  loadPlatformFunds,
  loadSpif,
  logSpif,
  newFirmId,
  reorderDeals,
  saveFirm,
  supabaseEnabled,
  updateDeal,
  updateSpif,
  type PlatformFund,
  type SpifEvent,
} from "./lib/store";
import { loadMyPartner, type Partner } from "./lib/partners";
import { PartnerPortal } from "./components/PartnerPortal";
import { checkPassword, TEAM, userByEmail, userById, type TeamUser } from "./lib/users";
import type { Deal, Firm } from "./types";

const ONBOARDING_URL =
  (import.meta.env.VITE_ONBOARDING_URL as string | undefined) ||
  "https://thenest.com.au/fund-manager/onboarding";

const AUTH_KEY = "nest_crm_user";

type Tab = "universe" | "pipeline" | "funds" | "spif" | "deals" | "partners" | "collateral";

export default function App() {
  // With Supabase configured, sign-in is a real Supabase Auth account.
  // Without it (local/dev mode), a simple team picker stands in.
  return supabaseEnabled ? <SupabaseApp /> : <LocalApp />;
}

// A signed-in identity is either a team member (full CRM) or a partner (portal).
type Session =
  | { kind: "team"; user: TeamUser }
  | { kind: "partner"; partner: Partner };

async function resolveSession(email: string | undefined): Promise<Session | null> {
  const team = userByEmail(email);
  if (team) return { kind: "team", user: team };
  const partner = await loadMyPartner(email ?? "");
  if (partner) return { kind: "partner", partner };
  return null;
}

function SupabaseApp() {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    client()
      .auth.getSession()
      .then(async ({ data }) => {
        setSession(await resolveSession(data.session?.user?.email));
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <div className="gate">Signing in…</div>;
  }
  if (!session) {
    return <EmailGate onSignedIn={setSession} />;
  }
  const onSignOut = () => {
    void client().auth.signOut();
    setSession(null);
  };
  return session.kind === "team" ? (
    <Crm user={session.user} onSignOut={onSignOut} />
  ) : (
    <PartnerPortal partner={session.partner} onSignOut={onSignOut} />
  );
}

function EmailGate({ onSignedIn }: { onSignedIn: (s: Session) => void }) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setErr("");
    const { data, error } = await client().auth.signInWithPassword({
      email: email.trim(),
      password: pw,
    });
    if (error) {
      setErr(error.message);
      setBusy(false);
      return;
    }
    const s = await resolveSession(data.user?.email);
    if (!s) {
      setErr(`${data.user?.email} isn't set up for access. Contact The Nest.`);
      await client().auth.signOut();
      setBusy(false);
      return;
    }
    onSignedIn(s);
  }

  return (
    <div className="gate">
      <h1>The Nest</h1>
      <div className="sub">Fund Manager CRM</div>
      <form
        style={{ flexDirection: "column", alignItems: "stretch" }}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <input
          type="email"
          placeholder="you@thenest.com.au"
          value={email}
          autoFocus
          onChange={(e) => {
            setEmail(e.target.value);
            setErr("");
          }}
        />
        <input
          type="password"
          placeholder="Password"
          value={pw}
          onChange={(e) => {
            setPw(e.target.value);
            setErr("");
          }}
        />
        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
      {err && <div className="err">{err}</div>}
    </div>
  );
}

function LocalApp() {
  const [user, setUser] = useState<TeamUser | null>(() =>
    userById(sessionStorage.getItem(AUTH_KEY)),
  );

  if (!user) {
    return (
      <LocalGate
        onPass={(u) => {
          sessionStorage.setItem(AUTH_KEY, u.id);
          setUser(u);
        }}
      />
    );
  }
  return (
    <Crm
      user={user}
      onSignOut={() => {
        sessionStorage.removeItem(AUTH_KEY);
        setUser(null);
      }}
    />
  );
}

function LocalGate({ onPass }: { onPass: (user: TeamUser) => void }) {
  const [who, setWho] = useState(TEAM[0].id);
  const [pw, setPw] = useState("");
  const [err, setErr] = useState(false);

  return (
    <div className="gate">
      <h1>The Nest</h1>
      <div className="sub">Fund Manager CRM · local mode</div>
      {configError && (
        <div className="notice" style={{ maxWidth: 420, borderColor: "#5a3830", color: "var(--red)" }}>
          {configError}
        </div>
      )}
      <form
        style={{ flexDirection: "column", alignItems: "stretch" }}
        onSubmit={(e) => {
          e.preventDefault();
          const u = userById(who);
          if (u && checkPassword(u, pw)) onPass(u);
          else setErr(true);
        }}
      >
        <select value={who} onChange={(e) => setWho(e.target.value)}>
          {TEAM.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <input
          type="password"
          placeholder="Password"
          value={pw}
          autoFocus
          onChange={(e) => {
            setPw(e.target.value);
            setErr(false);
          }}
        />
        <button className="btn primary" type="submit">
          Enter
        </button>
      </form>
      {err && <div className="err">Wrong password.</div>}
    </div>
  );
}

function Crm({ user, onSignOut }: { user: TeamUser; onSignOut: () => void }) {
  const [firms, setFirms] = useState<Firm[] | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [tab, setTab] = useState<Tab>("universe");
  const [openId, setOpenId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [spif, setSpif] = useState<SpifEvent[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [platform, setPlatform] = useState<PlatformFund[]>([]);
  const [outlookUser, setOutlookUser] = useState<string | null>(null);
  const [outlookBusy, setOutlookBusy] = useState(false);
  const [outlookErr, setOutlookErr] = useState("");
  const [toughNonce, setToughNonce] = useState(0);

  const toughCount = useMemo(() => (firms ?? []).filter(isTough).length, [firms]);

  useEffect(() => {
    loadFirms()
      .then(setFirms)
      .catch((e) => setLoadErr(e instanceof Error ? e.message : "Load failed"));
    loadSpif().then(setSpif).catch(() => {});
    if (user.seesAllFunds) {
      loadDeals().then(setDeals).catch(() => {});
      loadPlatformFunds().then(setPlatform).catch(() => {});
    }
    // Auto-connect Outlook to the signed-in person's mailbox: complete any
    // redirect sign-in we're returning from, reuse an existing session, else
    // try a silent SSO with their email. If that needs interaction, we quietly
    // leave the Connect button for them.
    (async () => {
      try {
        const existing = await initOutlook();
        if (existing) {
          setOutlookUser(existing.username);
          return;
        }
        if (user.email) {
          const acc = await ssoConnect(user.email);
          setOutlookUser(acc?.username ?? null);
        }
      } catch {
        /* interaction required — manual connect */
      }
    })();
  }, [user]);

  async function toggleOutlook() {
    setOutlookBusy(true);
    setOutlookErr("");
    try {
      if (outlookUser) {
        await disconnectOutlook();
        setOutlookUser(null);
      } else {
        const acc = await connectOutlook(user.email);
        setOutlookUser(acc.username);
      }
    } catch (e) {
      setOutlookErr(e instanceof Error ? e.message : "Outlook sign-in failed.");
    } finally {
      setOutlookBusy(false);
    }
  }

  async function handleDealCreate(deal: Deal) {
    try {
      const saved = await createDeal(deal);
      setDeals((d) => [...d, saved]);
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "Deal save failed");
    }
  }
  function handleDealUpdate(deal: Deal) {
    setDeals((d) => d.map((x) => (x.id === deal.id ? deal : x)));
    updateDeal(deal).catch(() => {});
  }
  function handleDealDelete(id: Deal["id"]) {
    setDeals((d) => d.filter((x) => x.id !== id));
    deleteDeal(id).catch(() => {});
  }
  function handleDealReorder(next: Deal[]) {
    setDeals(next.map((d, i) => ({ ...d, position: i })));
    reorderDeals(next).catch(() => {});
  }

  async function handleSpifAdd(ev: SpifEvent) {
    try {
      const saved = await logSpif(ev);
      setSpif((s) => [saved, ...s].sort((a, b) => b.ts.localeCompare(a.ts)));
    } catch {
      /* ignore */
    }
  }
  function handleSpifUpdate(ev: SpifEvent) {
    setSpif((s) =>
      s
        .map((e) => ((e.id ?? e.ts) === (ev.id ?? ev.ts) ? ev : e))
        .sort((a, b) => b.ts.localeCompare(a.ts)),
    );
    updateSpif(ev).catch(() => {});
  }

  const open = useMemo(
    () => (openId ? (firms ?? []).find((f) => f.id === openId) ?? null : null),
    [openId, firms],
  );

  const stats = useMemo(() => {
    const fs = firms ?? [];
    const by = (s: string) => fs.filter((f) => f.status === s).length;
    return {
      total: fs.length,
      live: by("Live"),
      onboarded: by("Onboarded"),
      active: by("Active"),
      engaged: by("Engaged"),
      overdue: fs.filter((f) => {
        if (f.status === "Dead" || f.status === "Not Now") return false;
        const d = daysUntil(f.followup);
        return d !== null && d < 0;
      }).length,
    };
  }, [firms]);

  async function handleSave(firm: Firm) {
    const prev = (firms ?? []).find((f) => f.id === firm.id);
    await saveFirm(firm);
    setFirms((fs) => {
      if (!fs) return fs;
      const i = fs.findIndex((f) => f.id === firm.id);
      if (i >= 0) {
        const next = [...fs];
        next[i] = firm;
        return next;
      }
      return [...fs, firm];
    });

    // SPIF: log a close when a firm moves into Onboarded or Live.
    if (
      (firm.status === "Onboarded" || firm.status === "Live") &&
      prev &&
      prev.status !== firm.status
    ) {
      const ev: SpifEvent = {
        ts: new Date().toISOString(),
        firm_id: firm.id,
        firm_name: firm.name,
        owner: firm.owner,
        kind: firm.status,
        logged_by: user.name,
      };
      logSpif(ev)
        .then((saved) => setSpif((s) => [saved, ...s]))
        .catch(() => {});
    }
  }

  async function handleSpifDelete(ev: SpifEvent) {
    await deleteSpif(ev).catch(() => {});
    setSpif((s) => s.filter((e) => !(e.ts === ev.ts && e.firm_id === ev.firm_id)));
  }

  async function handleDelete(id: string) {
    await deleteFirm(id);
    setFirms((fs) => (fs ? fs.filter((f) => f.id !== id) : fs));
  }

  function handleAdd() {
    const ids = new Set((firms ?? []).map((f) => f.id));
    const firm: Firm = {
      id: newFirmId(`new-firm-${Date.now()}`, ids),
      name: "",
      status: "Prospecting",
      owner: user.name,
      last_contact: todayISO(),
      asset_classes: [],
    };
    setFirms((fs) => [...(fs ?? []), firm]);
    setOpenId(firm.id);
  }

  return (
    <div className="shell">
      <header className="top">
        <h1>The Nest</h1>
        <span className="tag">thenest.com.au · {stats.total} firms</span>
        <div className="spacer" />
        <span className={`sync${supabaseEnabled ? " on" : ""}`}>
          {supabaseEnabled ? "● synced via supabase" : "○ local only — supabase not configured"}
        </span>
        <span className="sync">
          {user.email ?? user.name} · <button onClick={onSignOut}>sign out</button>
        </span>
      </header>

      <nav className="tabs">
        <button className={tab === "universe" ? "on" : ""} onClick={() => setTab("universe")}>
          Universe
        </button>
        <button className={tab === "pipeline" ? "on" : ""} onClick={() => setTab("pipeline")}>
          Pipeline
        </button>
        <button className={tab === "funds" ? "on" : ""} onClick={() => setTab("funds")}>
          Live funds
        </button>
        <button className={tab === "spif" ? "on" : ""} onClick={() => setTab("spif")}>
          SPIF
        </button>
        {user.seesAllFunds && (
          <button className={tab === "deals" ? "on" : ""} onClick={() => setTab("deals")}>
            Deals
          </button>
        )}
        {user.seesAllFunds && (
          <button className={tab === "partners" ? "on" : ""} onClick={() => setTab("partners")}>
            Partners
          </button>
        )}
        <button className={tab === "collateral" ? "on" : ""} onClick={() => setTab("collateral")}>
          Collateral
        </button>
        <div style={{ flex: 1 }} />
        {toughCount > 0 && (
          <button
            className="btn"
            onClick={() => {
              setToughNonce((n) => n + 1);
              setTab("pipeline");
            }}
            title="Firms chased repeatedly with no response, or flagged by hand — approach with care"
          >
            🪺 Tough basket {toughCount}
          </button>
        )}
        <a
          className="btn"
          href={ONBOARDING_URL}
          target="_blank"
          rel="noreferrer"
          style={{ textDecoration: "none" }}
        >
          FM onboarding ↗
        </a>
        {outlookConfigured && (
          <button
            className={`btn${outlookUser ? "" : " primary"}`}
            disabled={outlookBusy}
            onClick={toggleOutlook}
            title={
              outlookUser
                ? `Connected as ${outlookUser} — click to disconnect`
                : "Connect your @thenest.com.au mailbox for per-firm emails & calendar"
            }
          >
            {outlookBusy ? "…" : outlookUser ? "✉ Outlook ✓" : "✉ Connect Outlook"}
          </button>
        )}
        <button className="btn primary" onClick={() => setSheetOpen(true)}>
          📞 Call sheet
        </button>
      </nav>

      {outlookConfigured &&
        typeof window !== "undefined" &&
        !window.crypto?.subtle && (
          <div className="notice" style={{ borderColor: "#5a4326", color: "#d0a878" }}>
            ⚠ Outlook sign-in won't work in this browser — it's an in-app browser (e.g. opened
            from WhatsApp, Teams, LinkedIn or an email) or an outdated one. Open{" "}
            <b>crm.thenest.com.au</b> directly in <b>Safari, Chrome or Edge</b> to connect Outlook.
            Everything else works fine here.
          </div>
        )}
      {outlookErr && (
        <div className="notice" style={{ borderColor: "#5a3830", color: "var(--red)" }}>
          {outlookErr}{" "}
          <button onClick={() => setOutlookErr("")} style={{ color: "var(--tx3)" }}>
            dismiss
          </button>
        </div>
      )}

      <div className="stats">
        <Stat n={stats.total} label="Firms" />
        <Stat n={stats.live} label="Live" color="#6ec98a" />
        <Stat n={stats.onboarded} label="Onboarded" color="#4db8a0" />
        <Stat n={stats.active} label="Active" color="#e89060" />
        <Stat n={stats.engaged} label="Engaged" color="#78b4d0" />
        <Stat n={stats.overdue} label="Overdue" color="#d08070" />
      </div>

      {loadErr && (
        <div className="notice" style={{ borderColor: "#5a3830", color: "var(--red)" }}>
          {loadErr}
        </div>
      )}
      {!firms && !loadErr && <div className="empty">Loading firms…</div>}

      {firms && tab === "universe" && (
        <UniverseView
          firms={firms}
          onOpen={(f) => setOpenId(f.id)}
          onAdd={handleAdd}
          onExport={() => firms && exportExcel(firms, spif)}
          onMerge={async (merged, removeId) => {
            await handleSave(merged);
            await handleDelete(removeId);
          }}
        />
      )}
      {firms && tab === "pipeline" && (
        <PipelineView firms={firms} onOpen={(f) => setOpenId(f.id)} toughRequest={toughNonce} />
      )}
      {firms && tab === "funds" && (
        <LiveFundsView firms={firms} user={user} onOpen={(f) => setOpenId(f.id)} />
      )}
      {firms && tab === "spif" && (
        <SpifView
          events={spif}
          user={user}
          onAdd={handleSpifAdd}
          onUpdate={handleSpifUpdate}
          onDelete={handleSpifDelete}
        />
      )}
      {firms && tab === "deals" && user.seesAllFunds && (
        <MasterView
          firms={firms}
          platform={platform}
          deals={deals}
          onCreate={handleDealCreate}
          onUpdate={handleDealUpdate}
          onDelete={handleDealDelete}
          onReorder={handleDealReorder}
        />
      )}
      {firms && tab === "partners" && user.seesAllFunds && <PartnersAdmin firms={firms} />}
      {tab === "collateral" && <CollateralAdmin userName={user.name} />}

      {sheetOpen && firms && (
        <CallSheet
          firms={firms}
          onOpen={(f) => {
            setSheetOpen(false);
            setOpenId(f.id);
          }}
          onClose={() => setSheetOpen(false)}
          onLog={(f, kind) => void handleSave(touchFirm(f, kind, user.name))}
        />
      )}

      {open && (
        <FirmDrawer
          firm={open}
          userName={user.name}
          outlookConnected={Boolean(outlookUser)}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}

function Stat({ n, label, color }: { n: number; label: string; color?: string }) {
  return (
    <div className="stat">
      <div className="n" style={color ? { color } : undefined}>
        {n}
      </div>
      <div className="l">{label}</div>
    </div>
  );
}
