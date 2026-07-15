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
  type Partner,
  type PartnerEvent,
  type PartnerIntro,
} from "../lib/partners";
import { fmtDate } from "../lib/format";

/*
 * Partner-facing portal. A partner only ever sees their own introductions,
 * events, and the collateral shared with them — enforced by row-level
 * security, so nothing here can leak the team's CRM.
 */

const STATUS_COLOR: Record<string, string> = {
  Submitted: "#b8b098",
  "In progress": "#78b4d0",
  Met: "#e89060",
  Converted: "#6ec98a",
  Declined: "#907870",
};

export function PartnerPortal({ partner, onSignOut }: { partner: Partner; onSignOut: () => void }) {
  const [intros, setIntros] = useState<PartnerIntro[]>([]);
  const [events, setEvents] = useState<PartnerEvent[]>([]);
  const [collateral, setCollateral] = useState<Collateral[]>([]);
  const [tab, setTab] = useState<"intros" | "events" | "resources">("intros");

  const refresh = () => {
    loadIntros(false).then(setIntros).catch(() => {});
    loadPartnerEvents(false).then(setEvents).catch(() => {});
    loadCollateral().then(setCollateral).catch(() => {});
  };
  useEffect(refresh, []);

  const stats = useMemo(
    () => ({
      intros: intros.length,
      converted: intros.filter((i) => i.status === "Converted").length,
      events: events.length,
      paid: intros.filter((i) => i.fee_status === "Paid").length,
    }),
    [intros, events],
  );

  return (
    <div className="shell">
      <header className="top">
        <h1>The Nest</h1>
        <span className="tag">Partner Portal · {partner.name}</span>
        <div className="spacer" />
        <span className="sync">
          {partner.email} · <button onClick={onSignOut}>sign out</button>
        </span>
      </header>

      <nav className="tabs">
        <button className={tab === "intros" ? "on" : ""} onClick={() => setTab("intros")}>
          Introductions
        </button>
        <button className={tab === "events" ? "on" : ""} onClick={() => setTab("events")}>
          Events
        </button>
        <button className={tab === "resources" ? "on" : ""} onClick={() => setTab("resources")}>
          Resources
        </button>
      </nav>

      <div className="stats">
        <Stat n={stats.intros} label="Introductions" />
        <Stat n={stats.converted} label="Converted" color="#6ec98a" />
        <Stat n={stats.events} label="Events" color="#78b4d0" />
        <Stat n={stats.paid} label="Fees paid" color="#c8a86a" />
      </div>

      {partner.fee_terms && (
        <div className="notice">
          <b>Your terms:</b> {partner.fee_terms}
        </div>
      )}

      {tab === "intros" && <IntrosTab intros={intros} partner={partner} onDone={refresh} />}
      {tab === "events" && <EventsTab events={events} partner={partner} onDone={refresh} />}
      {tab === "resources" && <ResourcesTab collateral={collateral} />}
    </div>
  );
}

function IntrosTab({
  intros,
  partner,
  onDone,
}: {
  intros: PartnerIntro[];
  partner: Partner;
  onDone: () => void;
}) {
  const [kind, setKind] = useState<IntroKind>("investor");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function submit() {
    if (!name.trim()) {
      setMsg("Add a name.");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      await submitIntro({
        partner_id: partner.id,
        kind,
        name: name.trim(),
        contact_email: email.trim(),
        contact_note: note.trim(),
      });
      setName("");
      setEmail("");
      setNote("");
      setMsg("Submitted — thank you. The Nest team will pick it up.");
      onDone();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Submit failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="prio-grid">
      <div>
        <div className="section-h">Your introductions</div>
        {intros.length === 0 && <div className="empty">No introductions yet — submit one on the right.</div>}
        {intros.map((i) => (
          <div key={i.id} className="pcard" style={{ gridTemplateColumns: "1fr auto" }}>
            <div>
              <div className="name">
                {i.name}
                <span className="badge" style={{ background: "#2a3830", color: "#a8b0a0" }}>
                  {i.kind === "investor" ? "Investor" : "Fund manager"}
                </span>
                <span className="badge" style={{ background: "#20281f", color: STATUS_COLOR[i.status] ?? "#b8b098" }}>
                  {i.status}
                </span>
              </div>
              {i.contact_note && <div className="meta">{i.contact_note}</div>}
              <div className="meta">Submitted {fmtDate(i.created_at?.slice(0, 10))}</div>
            </div>
            <div className="score" style={{ textAlign: "right" }}>
              {i.fee_amount != null ? `$${Number(i.fee_amount).toLocaleString()}` : "—"}
              <small>{i.fee_status}</small>
            </div>
          </div>
        ))}
      </div>

      <div>
        <div className="panel">
          <h3>Submit an introduction</h3>
          <div className="sub">Investor or fund manager — we take it from there.</div>
          <div className="f" style={{ marginTop: 10 }}>
            <label>Type</label>
            <select value={kind} onChange={(e) => setKind(e.target.value as IntroKind)}>
              <option value="investor">Investor</option>
              <option value="fund_manager">Fund manager</option>
            </select>
          </div>
          <div className="f" style={{ marginTop: 8 }}>
            <label>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="f" style={{ marginTop: 8 }}>
            <label>Their email (optional)</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="f" style={{ marginTop: 8 }}>
            <label>Context (optional)</label>
            <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <button className="btn primary" style={{ marginTop: 10 }} disabled={busy} onClick={submit}>
            {busy ? "Submitting…" : "Submit introduction"}
          </button>
          {msg && <div className="sub" style={{ marginTop: 8, color: "#6ec98a" }}>{msg}</div>}
        </div>
      </div>
    </div>
  );
}

function EventsTab({
  events,
  partner,
  onDone,
}: {
  events: PartnerEvent[];
  partner: Partner;
  onDone: () => void;
}) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [kind, setKind] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function submit() {
    if (!title.trim()) {
      setMsg("Add a title.");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      await logPartnerEvent({
        partner_id: partner.id,
        title: title.trim(),
        event_date: date,
        kind: kind.trim(),
        location: location.trim(),
        notes: notes.trim(),
      });
      setTitle("");
      setDate("");
      setKind("");
      setLocation("");
      setNotes("");
      setMsg("Logged — thank you.");
      onDone();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="prio-grid">
      <div>
        <div className="section-h">Your events</div>
        {events.length === 0 && <div className="empty">No events logged yet.</div>}
        {events.map((e) => (
          <div key={e.id} className="pcard" style={{ gridTemplateColumns: "1fr auto" }}>
            <div>
              <div className="name">
                {e.title}
                {e.kind && <span className="badge" style={{ background: "#2a3830", color: "#a8b0a0" }}>{e.kind}</span>}
              </div>
              <div className="meta">
                {[e.event_date ? fmtDate(e.event_date) : null, e.location].filter(Boolean).join(" · ")}
              </div>
              {e.notes && <div className="meta">{e.notes}</div>}
            </div>
            <div />
          </div>
        ))}
      </div>
      <div>
        <div className="panel">
          <h3>Log an event</h3>
          <div className="sub">An event you helped run for The Nest.</div>
          <div className="f" style={{ marginTop: 10 }}>
            <label>Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="f" style={{ marginTop: 8 }}>
            <label>Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="f" style={{ marginTop: 8 }}>
            <label>Type (optional)</label>
            <input placeholder="dinner, webinar…" value={kind} onChange={(e) => setKind(e.target.value)} />
          </div>
          <div className="f" style={{ marginTop: 8 }}>
            <label>Location (optional)</label>
            <input value={location} onChange={(e) => setLocation(e.target.value)} />
          </div>
          <div className="f" style={{ marginTop: 8 }}>
            <label>Notes (optional)</label>
            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <button className="btn primary" style={{ marginTop: 10 }} disabled={busy} onClick={submit}>
            {busy ? "Saving…" : "Log event"}
          </button>
          {msg && <div className="sub" style={{ marginTop: 8, color: "#6ec98a" }}>{msg}</div>}
        </div>
      </div>
    </div>
  );
}

function ResourcesTab({ collateral }: { collateral: Collateral[] }) {
  async function open(item: Collateral) {
    const url = await collateralUrl(item.path);
    if (url) window.open(url, "_blank");
  }
  return (
    <div>
      <div className="section-h">
        Resources
        <span className="hint">marketing collateral shared by The Nest</span>
      </div>
      {collateral.length === 0 && <div className="empty">Nothing shared yet.</div>}
      <div className="deal-grid">
        {collateral.map((c) => (
          <div key={c.id} className="dtile" style={{ cursor: "pointer" }} onClick={() => open(c)}>
            <div className="dname">{c.name}</div>
            {c.description && <div className="dupdate">{c.description}</div>}
            <div className="ddate">↓ download</div>
          </div>
        ))}
      </div>
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
