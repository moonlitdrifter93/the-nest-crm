import { useEffect, useMemo, useState } from "react";
import {
  adminAddIntro,
  createPartnerLogin,
  deletePartnerEvent,
  loadIntros,
  loadPartnerEvents,
  loadPartners,
  logPartnerEvent,
  savePartner,
  updateIntro,
  type IntroKind,
  type IntroStatus,
  type FeeStatus,
  type Partner,
  type PartnerEvent,
  type PartnerIntro,
} from "../lib/partners";
import { fmtDate } from "../lib/format";
import { supabaseEnabled } from "../lib/store";
import type { Firm } from "../types";

function genPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  return Array.from({ length: 14 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

/*
 * Team-side admin for the partner portal: manage partners, review their
 * introductions (set status, fees, link the firm), and see logged events.
 */

const INTRO_STATUSES: IntroStatus[] = ["Submitted", "In progress", "Met", "Converted", "Declined"];
const FEE_STATUSES: FeeStatus[] = ["Pending", "Agreed", "Invoiced", "Paid", "N/A"];

export function PartnersAdmin({ firms }: { firms: Firm[] }) {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [intros, setIntros] = useState<PartnerIntro[]>([]);
  const [events, setEvents] = useState<PartnerEvent[]>([]);
  const [editing, setEditing] = useState<Partner | null>(null);
  const [view, setView] = useState<"intros" | "partners" | "events">("intros");
  const [allocEvent, setAllocEvent] = useState(false);
  const [allocIntro, setAllocIntro] = useState(false);

  const refresh = () => {
    loadPartners().then(setPartners).catch(() => {});
    loadIntros(true).then(setIntros).catch(() => {});
    loadPartnerEvents(true).then(setEvents).catch(() => {});
  };
  useEffect(refresh, []);

  return (
    <div>
      <div className="section-h">
        Partners
        <span className="hint">introductions, events and referral fees from your partners</span>
        <div style={{ flex: 1 }} />
        <div className="fchips">
          <button className={view === "intros" ? "on" : ""} onClick={() => setView("intros")}>
            Introductions {intros.length}
          </button>
          <button className={view === "events" ? "on" : ""} onClick={() => setView("events")}>
            Events {events.length}
          </button>
          <button className={view === "partners" ? "on" : ""} onClick={() => setView("partners")}>
            Partners {partners.length}
          </button>
        </div>
        <button
          className="btn primary"
          style={{ marginLeft: 10 }}
          onClick={() => {
            setView("partners");
            setEditing({ id: "", email: "", name: "" });
          }}
        >
          + Add Partner
        </button>
      </div>

      {view === "intros" && (
        <>
          <button className="btn primary" style={{ marginBottom: 12 }} onClick={() => setAllocIntro(true)}>
            + Add / allocate introduction
          </button>
          <IntrosAdmin intros={intros} firms={firms} onSaved={refresh} />
        </>
      )}

      {view === "events" && (
        <>
          <button className="btn primary" style={{ marginBottom: 12 }} onClick={() => setAllocEvent(true)}>
            + Allocate event to a partner
          </button>
          <div className="tbl-wrap">
            <table className="grid">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Event</th>
                  <th>Partner</th>
                  <th>Type</th>
                  <th>Location</th>
                  <th>Notes</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id}>
                    <td className="mono">{e.event_date ? fmtDate(e.event_date) : "—"}</td>
                    <td>{e.title}</td>
                    <td>{e.partners?.name ?? "—"}</td>
                    <td>{e.kind || "—"}</td>
                    <td>{e.location || "—"}</td>
                    <td><span className="sub">{e.notes || ""}</span></td>
                    <td>
                      <button
                        className="dbtn danger"
                        onClick={() => {
                          if (e.id && window.confirm(`Delete "${e.title}"?`)) deletePartnerEvent(e.id).then(refresh).catch(() => {});
                        }}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {events.length === 0 && <div className="empty">No events yet.</div>}
          </div>
        </>
      )}

      {view === "partners" && (
        <>
          <button className="btn primary" style={{ marginBottom: 12 }} onClick={() => setEditing({ id: "", email: "", name: "" })}>
            + Add partner
          </button>
          <div className="tbl-wrap">
            <table className="grid">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Company</th>
                  <th>Email</th>
                  <th>Fee terms</th>
                  <th>Intros</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {partners.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>{p.company || "—"}</td>
                    <td className="sub">{p.email}</td>
                    <td><span className="sub">{p.fee_terms || "—"}</span></td>
                    <td className="mono">{intros.filter((i) => i.partner_id === p.id).length}</td>
                    <td>
                      <button className="dbtn" onClick={() => setEditing(p)}>✎</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {partners.length === 0 && (
              <div className="empty">No partners yet — add one, then create their login in Supabase.</div>
            )}
          </div>
        </>
      )}

      {editing && (
        <PartnerEditor partner={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} />
      )}
      {allocEvent && (
        <AllocateEvent partners={partners} onClose={() => setAllocEvent(false)} onSaved={() => { setAllocEvent(false); refresh(); }} />
      )}
      {allocIntro && (
        <AllocateIntro partners={partners} onClose={() => setAllocIntro(false)} onSaved={() => { setAllocIntro(false); refresh(); }} />
      )}
    </div>
  );
}

function AllocateEvent({ partners, onClose, onSaved }: { partners: Partner[]; onClose: () => void; onSaved: () => void }) {
  const [partnerId, setPartnerId] = useState(partners[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [kind, setKind] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState("");

  async function save() {
    if (!partnerId || !title.trim()) {
      setErr("Pick a partner and add a title.");
      return;
    }
    try {
      await logPartnerEvent({ partner_id: partnerId, title: title.trim(), event_date: date, kind: kind.trim(), location: location.trim(), notes: notes.trim() });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="drawer">
        <button className="close" onClick={onClose}>×</button>
        <h2>Allocate event</h2>
        <div className="fgrid">
          <div className="f full"><label>Partner</label>
            <select value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
              {partners.map((p) => <option key={p.id} value={p.id}>{p.name}{p.company ? ` — ${p.company}` : ""}</option>)}
            </select></div>
          <div className="f full"><label>Title</label><input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div className="f"><label>Date</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="f"><label>Type</label><input placeholder="dinner, webinar…" value={kind} onChange={(e) => setKind(e.target.value)} /></div>
          <div className="f full"><label>Location</label><input value={location} onChange={(e) => setLocation(e.target.value)} /></div>
          <div className="f full"><label>Notes</label><textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
        {err && <div className="err" style={{ color: "var(--red)", marginTop: 8 }}>{err}</div>}
        <div className="actions">
          <button className="btn primary" onClick={save}>Allocate</button>
          <button className="btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </>
  );
}

function AllocateIntro({ partners, onClose, onSaved }: { partners: Partner[]; onClose: () => void; onSaved: () => void }) {
  const [partnerId, setPartnerId] = useState(partners[0]?.id ?? "");
  const [kind, setKind] = useState<IntroKind>("investor");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<IntroStatus>("Submitted");
  const [err, setErr] = useState("");

  async function save() {
    if (!partnerId || !name.trim()) {
      setErr("Pick a partner and add a name.");
      return;
    }
    try {
      await adminAddIntro({ partner_id: partnerId, kind, name: name.trim(), contact_email: email.trim(), contact_note: note.trim(), status });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="drawer">
        <button className="close" onClick={onClose}>×</button>
        <h2>Add introduction</h2>
        <div className="fgrid">
          <div className="f full"><label>Partner</label>
            <select value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
              {partners.map((p) => <option key={p.id} value={p.id}>{p.name}{p.company ? ` — ${p.company}` : ""}</option>)}
            </select></div>
          <div className="f"><label>Type</label>
            <select value={kind} onChange={(e) => setKind(e.target.value as IntroKind)}>
              <option value="investor">Investor</option>
              <option value="fund_manager">Fund manager</option>
            </select></div>
          <div className="f"><label>Stage</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as IntroStatus)}>
              {(["Submitted","In progress","Met","Converted","Declined"] as IntroStatus[]).map((s) => <option key={s}>{s}</option>)}
            </select></div>
          <div className="f full"><label>Name</label><input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="f full"><label>Email</label><input value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="f full"><label>Note</label><textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></div>
        </div>
        {err && <div className="err" style={{ color: "var(--red)", marginTop: 8 }}>{err}</div>}
        <div className="actions">
          <button className="btn primary" onClick={save}>Add</button>
          <button className="btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </>
  );
}

function IntrosAdmin({
  intros,
  firms,
  onSaved,
}: {
  intros: PartnerIntro[];
  firms: Firm[];
  onSaved: () => void;
}) {
  const firmOptions = useMemo(
    () => [...firms].sort((a, b) => a.name.localeCompare(b.name)),
    [firms],
  );

  async function patch(intro: PartnerIntro, changes: Partial<PartnerIntro>) {
    await updateIntro({ ...intro, ...changes }).catch(() => {});
    onSaved();
  }

  return (
    <div className="tbl-wrap">
      <table className="grid">
        <thead>
          <tr>
            <th>Introduction</th>
            <th>Partner</th>
            <th>Type</th>
            <th>Status</th>
            <th>Linked firm</th>
            <th>Fee $</th>
            <th>Fee status</th>
          </tr>
        </thead>
        <tbody>
          {intros.map((i) => (
            <tr key={i.id}>
              <td>
                {i.name}
                {i.contact_email && <div className="sub">{i.contact_email}</div>}
                {i.contact_note && <div className="sub">{i.contact_note}</div>}
              </td>
              <td>{i.partners?.name ?? "—"}</td>
              <td>{i.kind === "investor" ? "Investor" : "Fund mgr"}</td>
              <td>
                <select value={i.status} onChange={(e) => patch(i, { status: e.target.value as IntroStatus })}>
                  {INTRO_STATUSES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </td>
              <td>
                {i.kind === "fund_manager" ? (
                  <select
                    value={i.firm_id ?? ""}
                    onChange={(e) => patch(i, { firm_id: e.target.value || null })}
                  >
                    <option value="">— link —</option>
                    {firmOptions.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                ) : (
                  <span className="sub">n/a</span>
                )}
              </td>
              <td>
                <input
                  className="mono"
                  style={{ width: 90 }}
                  type="number"
                  defaultValue={i.fee_amount ?? ""}
                  onBlur={(e) => {
                    const v = e.target.value ? Number(e.target.value) : null;
                    if (v !== (i.fee_amount ?? null)) patch(i, { fee_amount: v });
                  }}
                />
              </td>
              <td>
                <select value={i.fee_status} onChange={(e) => patch(i, { fee_status: e.target.value as FeeStatus })}>
                  {FEE_STATUSES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {intros.length === 0 && <div className="empty">No introductions submitted yet.</div>}
    </div>
  );
}

function PartnerEditor({
  partner,
  onClose,
  onSaved,
}: {
  partner: Partner;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [p, setP] = useState<Partner>({ ...partner });
  const [password, setPassword] = useState(partner.id ? "" : genPassword());
  const [makeLogin, setMakeLogin] = useState(!partner.id);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");
  const isNew = !p.id;

  async function save() {
    if (!p.name.trim() || !p.email.trim()) {
      setErr("Name and email are required.");
      return;
    }
    if (isNew && makeLogin && supabaseEnabled && password.length < 8) {
      setErr("Password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      await savePartner({ ...p, id: p.id || undefined });
      // One-click login creation (production only).
      if (isNew && makeLogin && supabaseEnabled) {
        await createPartnerLogin(p.email.trim(), password);
        setDone(
          `Login created. Share these with ${p.name.split(" ")[0]}:\n\n${p.email.trim()}\n${password}\n\nThey sign in at crm.thenest.com.au.`,
        );
        setBusy(false);
        return; // keep the drawer open so the credentials can be copied
      }
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
      setBusy(false);
    }
  }

  if (done) {
    return (
      <>
        <div className="scrim" onClick={onSaved} />
        <div className="drawer">
          <button className="close" onClick={onSaved}>×</button>
          <h2>Partner added ✓</h2>
          <div className="notice" style={{ whiteSpace: "pre-wrap", borderColor: "#2a4a34", color: "#cfe8d5" }}>
            {done}
          </div>
          <div className="sub">Copy the password now — it isn't stored anywhere and can't be shown again.</div>
          <div className="actions">
            <button className="btn primary" onClick={onSaved}>Done</button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="drawer">
        <button className="close" onClick={onClose}>×</button>
        <h2>{p.id ? p.name : "New partner"}</h2>
        <div className="fgrid">
          <div className="f"><label>Name</label>
            <input value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} /></div>
          <div className="f"><label>Email</label>
            <input value={p.email} onChange={(e) => setP({ ...p, email: e.target.value })} /></div>
          <div className="f"><label>Company</label>
            <input value={p.company ?? ""} onChange={(e) => setP({ ...p, company: e.target.value })} /></div>
          <div className="f"><label>Phone</label>
            <input value={p.phone ?? ""} onChange={(e) => setP({ ...p, phone: e.target.value })} /></div>
          <div className="f full"><label>Fee terms</label>
            <textarea rows={3} value={p.fee_terms ?? ""} onChange={(e) => setP({ ...p, fee_terms: e.target.value })} /></div>
        </div>

        {isNew && supabaseEnabled && (
          <>
            <div className="sect">Portal login</div>
            <label className="tickrow" style={{ marginBottom: 8 }}>
              <input type="checkbox" checked={makeLogin} onChange={(e) => setMakeLogin(e.target.checked)} />
              Create their sign-in now
            </label>
            {makeLogin && (
              <div className="f full">
                <label>
                  Temporary password{" "}
                  <button className="dbtn" onClick={() => setPassword(genPassword())} title="Regenerate">↻</button>
                </label>
                <input value={password} onChange={(e) => setPassword(e.target.value)} />
                <div className="sub" style={{ marginTop: 4 }}>You'll get the credentials to share after saving.</div>
              </div>
            )}
          </>
        )}
        {isNew && !supabaseEnabled && (
          <div className="notice">Running in local mode — logins are created only in production.</div>
        )}

        {err && <div className="err" style={{ color: "var(--red)", marginTop: 8 }}>{err}</div>}
        <div className="actions">
          <button className="btn primary" disabled={busy} onClick={save}>
            {busy ? "Saving…" : isNew && makeLogin && supabaseEnabled ? "Save & create login" : "Save"}
          </button>
          <button className="btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </>
  );
}
