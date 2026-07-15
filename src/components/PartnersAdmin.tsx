import { useEffect, useMemo, useState } from "react";
import {
  loadIntros,
  loadPartnerEvents,
  loadPartners,
  savePartner,
  updateIntro,
  type IntroStatus,
  type FeeStatus,
  type Partner,
  type PartnerEvent,
  type PartnerIntro,
} from "../lib/partners";
import { fmtDate } from "../lib/format";
import type { Firm } from "../types";

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
      </div>

      {view === "intros" && (
        <IntrosAdmin intros={intros} firms={firms} onSaved={refresh} />
      )}

      {view === "events" && (
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
                </tr>
              ))}
            </tbody>
          </table>
          {events.length === 0 && <div className="empty">No events logged yet.</div>}
        </div>
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
    </div>
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
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    if (!p.name.trim() || !p.email.trim()) {
      setErr("Name and email are required.");
      return;
    }
    setBusy(true);
    try {
      await savePartner({ ...p, id: p.id || undefined });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
      setBusy(false);
    }
  }

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="drawer">
        <button className="close" onClick={onClose}>×</button>
        <h2>{p.id ? p.name : "New partner"}</h2>
        <div className="notice">
          After saving, create this person's login in Supabase → Authentication → Users with the
          <b> same email</b>, so they can sign in to the portal.
        </div>
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
        {err && <div className="err" style={{ color: "var(--red)", marginTop: 8 }}>{err}</div>}
        <div className="actions">
          <button className="btn primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button>
          <button className="btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </>
  );
}
