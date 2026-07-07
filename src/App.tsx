import { useEffect, useMemo, useState } from "react";
import { FirmDrawer } from "./components/FirmDrawer";
import { LiveFundsView } from "./components/LiveFundsView";
import { PipelineView } from "./components/PipelineView";
import { PriorityView } from "./components/PriorityView";
import { daysUntil, todayISO } from "./lib/format";
import {
  client,
  configError,
  deleteFirm,
  loadFirms,
  newFirmId,
  saveFirm,
  supabaseEnabled,
} from "./lib/store";
import { checkPassword, TEAM, userByEmail, userById, type TeamUser } from "./lib/users";
import type { Firm } from "./types";

const AUTH_KEY = "nest_crm_user";

type Tab = "priority" | "pipeline" | "funds";

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
  const [tab, setTab] = useState<Tab>("priority");
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    loadFirms()
      .then(setFirms)
      .catch((e) => setLoadErr(e instanceof Error ? e.message : "Load failed"));
  }, []);

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
        <button className={tab === "priority" ? "on" : ""} onClick={() => setTab("priority")}>
          Priorities
        </button>
        <button className={tab === "pipeline" ? "on" : ""} onClick={() => setTab("pipeline")}>
          Pipeline
        </button>
        <button className={tab === "funds" ? "on" : ""} onClick={() => setTab("funds")}>
          Live funds
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

      {firms && tab === "priority" && <PriorityView firms={firms} onOpen={(f) => setOpenId(f.id)} />}
      {firms && tab === "pipeline" && (
        <PipelineView firms={firms} onOpen={(f) => setOpenId(f.id)} onAdd={handleAdd} />
      )}
      {firms && tab === "funds" && (
        <LiveFundsView firms={firms} user={user} onOpen={(f) => setOpenId(f.id)} />
      )}

      {open && (
        <FirmDrawer
          firm={open}
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
