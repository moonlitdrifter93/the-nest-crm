import { useEffect, useMemo, useState } from "react";
import { contactCount, isTough } from "../lib/contact";
import { daysUntil, fmtDate, fmtFum, fmtRelative } from "../lib/format";
import { closeQueue } from "../lib/score";
import { OWNERS, type Firm, type Status } from "../types";
import { StatusBadge, ToughBadge } from "./StatusBadge";

/*
 * Pipeline — the working list of unsigned firms, ordered so the ones that
 * haven't had a touchpoint float to the top: never-contacted first, then
 * longest since last contact.
 */

const PIPELINE_STATUSES: Status[] = ["Active", "Engaged", "Prospecting"];

export function PipelineView({
  firms,
  onOpen,
  toughRequest = 0,
}: {
  firms: Firm[];
  onOpen: (firm: Firm) => void;
  toughRequest?: number;
}) {
  const [ownerFilter, setOwnerFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<Status | null>(null);
  const [toughOnly, setToughOnly] = useState(false);
  const [q, setQ] = useState("");

  // The top-nav "Tough basket" button bumps toughRequest to jump us here filtered.
  useEffect(() => {
    if (toughRequest > 0) {
      setToughOnly(true);
      setStatusFilter(null);
    }
  }, [toughRequest]);

  const toughCount = useMemo(() => firms.filter(isTough).length, [firms]);

  const scores = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of closeQueue(firms)) m.set(s.firm.id, s.score);
    return m;
  }, [firms]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return firms
      .filter((f) => {
        if (toughOnly) {
          if (!isTough(f)) return false;
        } else if (!PIPELINE_STATUSES.includes(f.status)) return false;
        if (ownerFilter && f.owner !== ownerFilter) return false;
        if (statusFilter && f.status !== statusFilter) return false;
        if (needle) {
          const hay = [f.name, f.contact, f.email, f.note, f.action, f.owner]
            .join(" ")
            .toLowerCase();
          if (!hay.includes(needle)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        // never contacted first, then oldest contact, ties by score
        const ac = a.last_contact || "";
        const bc = b.last_contact || "";
        if (!ac && bc) return -1;
        if (ac && !bc) return 1;
        if (ac !== bc) return ac.localeCompare(bc);
        return (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0);
      });
  }, [firms, ownerFilter, statusFilter, toughOnly, q, scores]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of firms) {
      if (PIPELINE_STATUSES.includes(f.status)) m.set(f.status, (m.get(f.status) ?? 0) + 1);
    }
    return m;
  }, [firms]);

  const untouched = rows.filter((f) => !f.last_contact).length;

  return (
    <div>
      <div className="section-h">
        Pipeline
        <span className="hint">
          untouched firms first — {untouched} with no recorded touchpoint
        </span>
      </div>

      <div className="toolbar">
        <input
          type="search"
          placeholder="Search pipeline…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)}>
          <option value="">All owners</option>
          {OWNERS.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      </div>

      <div className="fchips">
        <button
          className={!toughOnly && statusFilter === null ? "on" : ""}
          onClick={() => {
            setToughOnly(false);
            setStatusFilter(null);
          }}
        >
          All {[...counts.values()].reduce((s, n) => s + n, 0)}
        </button>
        {PIPELINE_STATUSES.map((s) => (
          <button
            key={s}
            className={!toughOnly && statusFilter === s ? "on" : ""}
            onClick={() => {
              setToughOnly(false);
              setStatusFilter(statusFilter === s ? null : s);
            }}
          >
            {s} {counts.get(s) ?? 0}
          </button>
        ))}
        <button
          className={toughOnly ? "on" : ""}
          onClick={() => {
            setToughOnly((v) => !v);
            setStatusFilter(null);
          }}
          title="7+ points of contact, still cold — approach with care, don't cross off"
        >
          🪺 Tough basket {toughCount}
        </button>
      </div>

      {toughOnly && (
        <div className="notice">
          These firms have had <b>7 or more points of contact</b> without engaging. We don't cross
          them off — approach with care: change the angle, space out the touches, and lead with
          something genuinely useful to them.
        </div>
      )}

      <div className="tbl-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th>Firm</th>
              <th>Stage</th>
              <th>Plan</th>
              <th>Owner</th>
              <th>FUM</th>
              <th>Contacts</th>
              <th>Touch gap</th>
              <th>Last contact</th>
              <th>Follow-up</th>
              <th>Score</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((f) => {
              const due = daysUntil(f.followup);
              const gap = f.last_contact ? -(daysUntil(f.last_contact) ?? 0) : null;
              return (
                <tr key={f.id} className="row" onClick={() => onOpen(f)}>
                  <td>
                    {f.name} {isTough(f) && <ToughBadge count={contactCount(f)} />}
                    {f.contact && <div className="sub">{f.contact}</div>}
                  </td>
                  <td>
                    <StatusBadge status={f.status} />
                  </td>
                  <td>
                    {f.plan ? (
                      <span className={`chip plan-${f.plan.toLowerCase()}`}>{f.plan}</span>
                    ) : (
                      <span className="sub">—</span>
                    )}
                  </td>
                  <td>{f.owner || <span className="sub">—</span>}</td>
                  <td className="mono">{fmtFum(f.fum)}</td>
                  <td className={`mono${contactCount(f) >= 7 ? " soon" : ""}`}>×{contactCount(f)}</td>
                  <td className={`mono${gap === null ? " overdue" : gap > 60 ? " soon" : ""}`}>
                    {gap === null ? "never" : `${gap}d ago`}
                  </td>
                  <td className="mono">{fmtDate(f.last_contact)}</td>
                  <td className={`mono${due !== null && due < 0 ? " overdue" : due !== null && due <= 7 ? " soon" : ""}`}>
                    {f.followup ? fmtRelative(f.followup) : "—"}
                  </td>
                  <td className="mono">{scores.get(f.id) ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <div className="empty">No firms match.</div>}
      </div>
    </div>
  );
}
