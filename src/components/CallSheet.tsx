import { useMemo, useState } from "react";
import { closeQueue } from "../lib/score";
import { fmtFum } from "../lib/format";
import { OWNERS, type Firm } from "../types";
import { StatusBadge } from "./StatusBadge";

/*
 * Daily call sheet — the top-scored firms to work today, with who to call,
 * their mobile and email front and centre, and the intel notes underneath.
 */

export function CallSheet({
  firms,
  onOpen,
  onClose,
}: {
  firms: Firm[];
  onOpen: (firm: Firm) => void;
  onClose: () => void;
}) {
  const [count, setCount] = useState(40);
  const [ownerFilter, setOwnerFilter] = useState("");

  const queue = useMemo(() => closeQueue(firms), [firms]);
  const list = useMemo(
    () =>
      queue
        .filter((s) => !ownerFilter || s.firm.owner === ownerFilter)
        .slice(0, count),
    [queue, ownerFilter, count],
  );

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="drawer sheet">
        <button className="close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h2>Today's call sheet</h2>
        <div className="sub" style={{ color: "var(--tx3)", marginBottom: 14 }}>
          Top {list.length} most likely to sign — ranked by propensity, platform gaps, and
          follow-up urgency
        </div>

        <div className="toolbar">
          <select value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)}>
            <option value="">Whole team</option>
            {OWNERS.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
          <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
            <option value={30}>Top 30</option>
            <option value={40}>Top 40</option>
            <option value={50}>Top 50</option>
          </select>
        </div>

        {list.map((s, i) => {
          const f = s.firm;
          const phone = f.phone?.trim() || f.contacts?.find((c) => c.phone?.trim())?.phone;
          const email = f.email?.trim() || f.contacts?.find((c) => c.email?.trim())?.email;
          return (
            <div key={f.id} className="callrow" onClick={() => onOpen(f)}>
              <div className="rank">{i + 1}</div>
              <div style={{ minWidth: 0 }}>
                <div className="name">
                  {f.name}
                  <StatusBadge status={f.status} />
                  {f.plan && (
                    <span className={`chip plan-${f.plan.toLowerCase()}`}>{f.plan}</span>
                  )}
                  <span className="sub" style={{ fontWeight: 400 }}>
                    {f.owner || "Unassigned"} · {fmtFum(f.fum)}
                  </span>
                </div>
                <div className="who">
                  <span className="person">
                    {f.contact || "No contact on file"}
                    {f.title ? `, ${f.title}` : ""}
                  </span>
                  {phone ? (
                    <a className="tel" href={`tel:${phone.replace(/\s+/g, "")}`} onClick={(e) => e.stopPropagation()}>
                      📞 {phone}
                    </a>
                  ) : (
                    <span className="tel missing">no number</span>
                  )}
                  {email ? (
                    <a className="mail" href={`mailto:${email}`} onClick={(e) => e.stopPropagation()}>
                      ✉️ {email}
                    </a>
                  ) : (
                    <span className="mail missing">no email</span>
                  )}
                </div>
                {f.action?.trim() && <div className="act">→ {f.action}</div>}
                {f.note?.trim() && <div className="notes">{f.note}</div>}
                <div className="why" style={{ marginTop: 8 }}>
                  {s.reasons.map((r, j) => (
                    <span key={j} className={`chip ${r.kind}`}>
                      {r.label}
                    </span>
                  ))}
                </div>
              </div>
              <div className="score">
                {s.score}
                <small>score</small>
              </div>
            </div>
          );
        })}
        {list.length === 0 && <div className="empty">No firms in the pipeline for this filter.</div>}
      </div>
    </>
  );
}
