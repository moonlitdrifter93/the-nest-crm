import { useEffect, useMemo, useState } from "react";
import { FirmDrawer } from "./components/FirmDrawer";
import { PipelineView } from "./components/PipelineView";
import { PriorityView } from "./components/PriorityView";
import { daysUntil, todayISO } from "./lib/format";
import { deleteFirm, loadFirms, newFirmId, saveFirm, supabaseEnabled } from "./lib/store";
import type { Firm } from "./types";

const APP_PW = (import.meta.env.VITE_APP_PASSWORD as string | undefined) || "thenest2026";
const AUTH_KEY = "nest_crm_auth";

type Tab = "priority" | "pipeline";

export default function App() {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem(AUTH_KEY) === "1");
  if (!authed) return <Gate onPass={() => setAuthed(true)} />;
  return <Crm />;
}

function Gate({ onPass }: { onPass: () => void }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState(false);
  return (
    <div className="gate">
      <h1>The Nest</h1>
      <div className="sub">Fund Manager CRM</div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (pw === APP_PW) {
            sessionStorage.setItem(AUTH_KEY, "1");
            onPass();
          } else setErr(true);
        }}
      >
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

function Crm() {
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
      </header>

      <nav className="tabs">
        <button className={tab === "priority" ? "on" : ""} onClick={() => setTab("priority")}>
          Priorities
        </button>
        <button className={tab === "pipeline" ? "on" : ""} onClick={() => setTab("pipeline")}>
          Pipeline
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
