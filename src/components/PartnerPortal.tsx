import { useEffect, useMemo, useState } from "react";
import {
  collateralUrl,
  loadCollateral,
  loadIntros,
  loadPartnerEvents,
  logPartnerEvent,
  submitIntro,
  type Collateral,
  type IntroKind,
  type IntroStatus,
  type Partner,
  type PartnerEvent,
  type PartnerIntro,
} from "../lib/partners";
import { fmtDate } from "../lib/format";

/*
 * Partner portal — Base44-style light layout: left sidebar + dashboard,
 * investor-pipeline kanban, events, and a resources hub. A partner only ever
 * sees their own data (enforced by row-level security).
 */

type Page = "dashboard" | "pipeline" | "events" | "resources";

const STAGES: { key: IntroStatus; label: string; color: string }[] = [
  { key: "Submitted", label: "Submitted", color: "#2f6bff" },
  { key: "In progress", label: "In Progress", color: "#7c5cff" },
  { key: "Met", label: "Met", color: "#f59e0b" },
  { key: "Converted", label: "Converted", color: "#10b981" },
  { key: "Declined", label: "Passed", color: "#94a3b8" },
];

export function PartnerPortal({ partner, onSignOut }: { partner: Partner; onSignOut: () => void }) {
  const [page, setPage] = useState<Page>("dashboard");
  const [intros, setIntros] = useState<PartnerIntro[]>([]);
  const [events, setEvents] = useState<PartnerEvent[]>([]);
  const [collateral, setCollateral] = useState<Collateral[]>([]);

  const refresh = () => {
    loadIntros(false).then(setIntros).catch(() => {});
    loadPartnerEvents(false).then(setEvents).catch(() => {});
    loadCollateral().then(setCollateral).catch(() => {});
  };
  useEffect(refresh, []);

  return (
    <div className="portal">
      <aside className="psidebar">
        <div className="pbrand">
          <div className="logo">◆</div>
          <div>
            <div className="bt">The Nest</div>
            <div className="bs">Partner Portal</div>
          </div>
        </div>

        <div className="pclient">
          <span className="badge2">PARTNER</span>
          <div className="cn">{partner.company || partner.name}</div>
          <div className="cd">
            {partner.name}
            {partner.phone && (
              <>
                <br />
                {partner.phone}
              </>
            )}
            <br />
            {partner.email}
          </div>
        </div>

        <div className="pnav-label">NAVIGATION</div>
        <button className={`pnav${page === "dashboard" ? " on" : ""}`} onClick={() => setPage("dashboard")}>
          ▦ Dashboard
        </button>
        <button className={`pnav${page === "pipeline" ? " on" : ""}`} onClick={() => setPage("pipeline")}>
          ↗ Investor Pipeline
        </button>
        <button className={`pnav${page === "events" ? " on" : ""}`} onClick={() => setPage("events")}>
          ▦ Events Calendar
        </button>
        <button className={`pnav${page === "resources" ? " on" : ""}`} onClick={() => setPage("resources")}>
          ▤ Resources
        </button>

        <div className="spacer" />
        <button className="pnav" onClick={onSignOut}>
          ⏻ Sign Out
        </button>
      </aside>

      <main className="pmain">
        {page === "dashboard" && <Dashboard intros={intros} events={events} onGoto={setPage} />}
        {page === "pipeline" && <Pipeline intros={intros} partner={partner} onDone={refresh} />}
        {page === "events" && <Events events={events} partner={partner} onDone={refresh} />}
        {page === "resources" && <Resources collateral={collateral} />}
      </main>
    </div>
  );
}

/* ---------------- Dashboard ---------------- */

function Dashboard({
  intros,
  events,
  onGoto,
}: {
  intros: PartnerIntro[];
  events: PartnerEvent[];
  onGoto: (p: Page) => void;
}) {
  const stats = useMemo(() => {
    const by = (s: IntroStatus) => intros.filter((i) => i.status === s).length;
    const feePaid = intros.filter((i) => i.fee_status === "Paid").reduce((s, i) => s + (Number(i.fee_amount) || 0), 0);
    return {
      total: intros.length,
      active: by("In progress") + by("Met"),
      converted: by("Converted"),
      events: events.length,
      feePaid,
    };
  }, [intros, events]);

  const activity = useMemo(
    () =>
      [...intros]
        .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
        .slice(0, 6),
    [intros],
  );

  return (
    <>
      <div className="ph">
        <div>
          <h1>Dashboard</h1>
          <div className="sub">Your introductions, events and referrals with The Nest</div>
        </div>
        <div className="spacer" />
        <button className="pbtn ghost" onClick={() => onGoto("pipeline")}>
          View pipeline
        </button>
      </div>

      <div className="ptiles">
        <Tile label="Introductions" value={stats.total} icon="👥" sub={`${stats.active} active`} />
        <Tile label="Converted" value={stats.converted} icon="🎯" sub="closed" />
        <Tile label="Events" value={stats.events} icon="📅" sub="run with The Nest" />
        <Tile
          label="Fees paid"
          value={`$${stats.feePaid.toLocaleString()}`}
          hero
          sub="referral fees settled"
        />
      </div>

      <div className="pcols2">
        <div className="ppanel">
          <h3>Activity</h3>
          {activity.length === 0 && <div className="pempty">No activity yet.</div>}
          {activity.map((i) => (
            <div key={i.id} className="pfeed">
              <div className="fic">{i.kind === "investor" ? "↗" : "◆"}</div>
              <div>
                <div className="ft">
                  {i.name} · {i.kind === "investor" ? "Investor" : "Fund manager"}
                </div>
                <div className="fd">
                  {i.status} · submitted {fmtDate(i.created_at?.slice(0, 10))}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="ppanel">
          <h3>Pipeline by stage</h3>
          {STAGES.map((s) => {
            const n = intros.filter((i) => i.status === s.key).length;
            const pct = intros.length ? Math.round((n / intros.length) * 100) : 0;
            return (
              <div key={s.key} className="pbar-row">
                <div className="lab">
                  <span>{s.label}</span>
                  <span>{n}</span>
                </div>
                <div className="pbar">
                  <span style={{ width: `${pct}%`, background: s.color }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

/* ---------------- Investor Pipeline (kanban) ---------------- */

function Pipeline({
  intros,
  partner,
  onDone,
}: {
  intros: PartnerIntro[];
  partner: Partner;
  onDone: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? intros.filter((i) => (i.name + " " + (i.contact_note ?? "")).toLowerCase().includes(n)) : intros;
  }, [intros, q]);

  return (
    <>
      <div className="ph">
        <div>
          <h1>Investor Pipeline</h1>
          <div className="sub">Introductions you've made · The Nest moves them through the stages</div>
        </div>
        <div className="spacer" />
        <input className="psearch" style={{ maxWidth: 240 }} placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="pbtn teal" onClick={() => setAdding(true)}>
          + Add Introduction
        </button>
      </div>

      <div className="pkan">
        {STAGES.map((s) => {
          const cards = filtered.filter((i) => i.status === s.key);
          return (
            <div key={s.key} className="pkan-col">
              <div className="pkan-head" style={{ background: s.color }}>
                <span>{s.label}</span>
                <span>{cards.length}</span>
              </div>
              {cards.map((i) => (
                <div key={i.id} className="pkan-card">
                  <div className="kn">{i.name}</div>
                  {i.contact_note && <div className="kmeta">{i.contact_note}</div>}
                  <div>
                    <span className="ptag">{i.kind === "investor" ? "investor" : "fund manager"}</span>
                  </div>
                  {i.fee_amount != null && (
                    <div className="pfee">
                      ${Number(i.fee_amount).toLocaleString()} · {i.fee_status}
                    </div>
                  )}
                </div>
              ))}
              {cards.length === 0 && <div className="kmeta" style={{ padding: "4px 2px" }}>—</div>}
            </div>
          );
        })}
      </div>

      {adding && <AddIntro partner={partner} onClose={() => setAdding(false)} onDone={() => { setAdding(false); onDone(); }} />}
    </>
  );
}

function AddIntro({ partner, onClose, onDone }: { partner: Partner; onClose: () => void; onDone: () => void }) {
  const [kind, setKind] = useState<IntroKind>("investor");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    if (!name.trim()) {
      setErr("Add a name.");
      return;
    }
    setBusy(true);
    try {
      await submitIntro({
        partner_id: partner.id,
        kind,
        name: name.trim(),
        contact_email: email.trim(),
        contact_note: note.trim(),
      });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
      setBusy(false);
    }
  }

  return (
    <div className="pmodal" onClick={onClose}>
      <div className="box" onClick={(e) => e.stopPropagation()}>
        <h3>Add introduction</h3>
        <label className="plabel">Type</label>
        <select className="pinput" value={kind} onChange={(e) => setKind(e.target.value as IntroKind)}>
          <option value="investor">Investor</option>
          <option value="fund_manager">Fund manager</option>
        </select>
        <label className="plabel" style={{ marginTop: 10 }}>Name</label>
        <input className="pinput" value={name} onChange={(e) => setName(e.target.value)} />
        <label className="plabel" style={{ marginTop: 10 }}>Their email (optional)</label>
        <input className="pinput" value={email} onChange={(e) => setEmail(e.target.value)} />
        <label className="plabel" style={{ marginTop: 10 }}>Context (optional)</label>
        <textarea className="pinput" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        {err && <div style={{ color: "#dc2626", fontSize: 13, marginTop: 8 }}>{err}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button className="pbtn teal" disabled={busy} onClick={submit}>{busy ? "Submitting…" : "Submit"}</button>
          <button className="pbtn ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Events ---------------- */

function Events({ events, partner, onDone }: { events: PartnerEvent[]; partner: Partner; onDone: () => void }) {
  const [adding, setAdding] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = events.filter((e) => (e.event_date ?? "") >= today);
  const past = events.filter((e) => (e.event_date ?? "") < today);

  return (
    <>
      <div className="ph">
        <div>
          <h1>Events &amp; Roadshows</h1>
          <div className="sub">Events you've run or are allocated to with The Nest</div>
        </div>
        <div className="spacer" />
        <button className="pbtn teal" onClick={() => setAdding(true)}>+ Log Event</button>
      </div>

      <div className="ptiles" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
        <Tile label="Upcoming Events" value={upcoming.length} />
        <Tile label="Past Events" value={past.length} />
        <Tile label="Total" value={events.length} />
      </div>

      <div className="ppanel" style={{ marginBottom: 16 }}>
        <h3>Upcoming</h3>
        {upcoming.length === 0 ? (
          <div className="pempty">No upcoming events scheduled</div>
        ) : (
          upcoming.map((e) => <EventRow key={e.id} e={e} />)
        )}
      </div>

      <div className="ppanel">
        <h3>Past events</h3>
        {past.length === 0 ? <div className="pempty">None yet.</div> : past.map((e) => <EventRow key={e.id} e={e} />)}
      </div>

      {adding && <AddEvent partner={partner} onClose={() => setAdding(false)} onDone={() => { setAdding(false); onDone(); }} />}
    </>
  );
}

function EventRow({ e }: { e: PartnerEvent }) {
  return (
    <div className="pfeed">
      <div className="fic">📅</div>
      <div>
        <div className="ft">
          {e.kind && <span className="ptag" style={{ marginRight: 8 }}>{e.kind}</span>}
          {e.title}
        </div>
        <div className="fd">{[e.event_date ? fmtDate(e.event_date) : null, e.location].filter(Boolean).join(" · ")}</div>
      </div>
    </div>
  );
}

function AddEvent({ partner, onClose, onDone }: { partner: Partner; onClose: () => void; onDone: () => void }) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [kind, setKind] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    if (!title.trim()) {
      setErr("Add a title.");
      return;
    }
    setBusy(true);
    try {
      await logPartnerEvent({ partner_id: partner.id, title: title.trim(), event_date: date, kind: kind.trim(), location: location.trim(), notes: notes.trim() });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
      setBusy(false);
    }
  }

  return (
    <div className="pmodal" onClick={onClose}>
      <div className="box" onClick={(e) => e.stopPropagation()}>
        <h3>Log event</h3>
        <label className="plabel">Title</label>
        <input className="pinput" value={title} onChange={(e) => setTitle(e.target.value)} />
        <label className="plabel" style={{ marginTop: 10 }}>Date</label>
        <input className="pinput" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <label className="plabel" style={{ marginTop: 10 }}>Type (optional)</label>
        <input className="pinput" placeholder="dinner, webinar…" value={kind} onChange={(e) => setKind(e.target.value)} />
        <label className="plabel" style={{ marginTop: 10 }}>Location (optional)</label>
        <input className="pinput" value={location} onChange={(e) => setLocation(e.target.value)} />
        <label className="plabel" style={{ marginTop: 10 }}>Notes (optional)</label>
        <textarea className="pinput" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        {err && <div style={{ color: "#dc2626", fontSize: 13, marginTop: 8 }}>{err}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button className="pbtn teal" disabled={busy} onClick={submit}>{busy ? "Saving…" : "Log event"}</button>
          <button className="pbtn ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Resources ---------------- */

function Resources({ collateral }: { collateral: Collateral[] }) {
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? collateral.filter((c) => (c.name + " " + (c.description ?? "")).toLowerCase().includes(n)) : collateral;
  }, [collateral, q]);

  async function open(c: Collateral) {
    const url = await collateralUrl(c.path);
    if (url) window.open(url, "_blank");
  }

  return (
    <>
      <div className="ph">
        <div>
          <h1>Resources Hub</h1>
          <div className="sub">Materials, insights and market intelligence</div>
        </div>
      </div>
      <input className="psearch" style={{ maxWidth: 460, marginBottom: 16 }} placeholder="Search materials…" value={q} onChange={(e) => setQ(e.target.value)} />
      <table className="ptable">
        <thead>
          <tr>
            <th>Material</th>
            <th>Added</th>
            <th style={{ textAlign: "right" }}>Download</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id}>
              <td>
                <div style={{ fontWeight: 600 }}>{c.name}</div>
                {c.description && <div style={{ color: "#97a0ad", fontSize: 12, marginTop: 2 }}>{c.description}</div>}
              </td>
              <td>{fmtDate(c.created_at?.slice(0, 10))}</td>
              <td style={{ textAlign: "right" }}>
                <span className="plink" onClick={() => open(c)}>↓ Open</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <div className="pempty">Nothing shared yet.</div>}
    </>
  );
}

/* ---------------- shared ---------------- */

function Tile({ label, value, icon, sub, hero }: { label: string; value: number | string; icon?: string; sub?: string; hero?: boolean }) {
  return (
    <div className={`ptile${hero ? " hero" : ""}`}>
      <div className="tl">
        {label}
        {icon && <span className="ic">{icon}</span>}
      </div>
      <div className="tv">{value}</div>
      {sub && <div className="tvsub">{sub}</div>}
    </div>
  );
}
