import { useEffect, useMemo, useState } from "react";
import { CallSheet } from "./components/CallSheet";
import { FirmDrawer } from "./components/FirmDrawer";
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
  outlookConfigured,
  restoreOutlook,
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
import { checkPassword, TEAM, userByEmail, userById, type TeamUser } from "./lib/users";
import type { Deal, Firm } from "./types";

const ONBOARDING_URL =
  (import.meta.env.VITE_ONBOARDING_URL as string | undefined) ||
  "https://thenest.com.au/fund-manager/onboarding";

const AUTH_KEY = "nest_crm_user";

type Tab = "universe" | "pipeline" | "funds" | "spif" | "deals";

export default function App() {
  // With Supabase configured, sign-in is a real Supabase Auth account.
  // Without it (local/dev mode), a simple team picker stands in.
  return supabaseEnabled ? <SupabaseApp /> : <LocalApp />;
}

function SupabaseApp() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<TeamUser | null>(null);

  useEffect(() => {
    client()
      .auth.getSession()
      .then(({ data }) => {
        setUser(userByEmail(data.session?.user?.email));
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <div className="gate">Signing in…</div>;
  }
  if (!user) {
    return <EmailGate onSignedIn={setUser} />;
  }
  return (
    <Crm
      user={user}
      onSignOut={() => {
        void client().auth.signOut();
        setUser(null);
      }}
    />
  );
}

function EmailGate({ onSignedIn }: { onSignedIn: (user: TeamUser) => void }) {
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
    const u = userByEmail(data.user?.email);
    if (!u) {
      setErr(`${data.user?.email} has no CRM profile — add it in src/lib/users.ts.`);
      await client().auth.signOut();
      setBusy(false);
      return;
    }
    onSignedIn(u);
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
    restoreOutlook()
      .then((acc) => setOutlookUser(acc?.username ?? null))
      .catch(() => {});
  }, [user]);

  async function toggleOutlook() {
    setOutlookBusy(true);
    try {
      if (outlookUser) {
        await disconnectOutlook();
        setOutlookUser(null);
      } else {
        const acc = await connectOutlook();
        setOutlookUser(acc.username);
      }
    } catch {
      /* popup closed or denied */
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
        <div style={{ flex: 1 }} />
        {toughCount > 0 && (
          <button
            className="btn"
            onClick={() => {
              setToughNonce((n) => n + 1);
              setTab("pipeline");
            }}
            title="Firms with 7+ points of contact, still cold — approach with care"
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
