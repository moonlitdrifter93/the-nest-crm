import { useEffect, useMemo, useState } from "react";
import { contactCount, isTough } from "../lib/contact";
import { daysUntil, fmtDate, fmtFum, fmtRelative } from "../lib/format";
import { closeQueue } from "../lib/score";
import { OWNERS, STATUS_STYLE, type Firm, type Status } from "../types";
import { StatusBadge, ToughBadge } from "./StatusBadge";

/*
 * Pipeline — two ways to work the same list of unsigned/active firms:
 *
 *   Board (default): a 5-stage kanban a lead is dragged through, left to right
 *     Prospecting → Engaged → Active → Onboarded → Live. Easiest to eyeball
 *     where everything sits; dragging a card sets the firm's stage.
 *   List: the sortable table (untouched firms first) with scores & touch gaps.
 */

const PIPELINE_STATUSES: Status[] = ["Active", "Engaged", "Prospecting"];

// The lead journey, left → right. Not Now / Dead are parked, not on the board.
const BOARD_STAGES: Status[] = ["Prospecting", "Engaged", "Active", "Onboarded", "Live"];

const STAGE_HELP: Record<string, string> = {
  Prospecting: "New lead — not yet in conversation",
  Engaged: "In conversation, building interest",
  Active: "Warm — actively progressing",
  Onboarded: "Signed, first product coming online",
  Live: "Fund is live on the platform",
};

export function PipelineView({
  firms,
  onOpen,
  onMove,
  toughRequest = 0,
}: {
  firms: Firm[];
  onOpen: (firm: Firm) => void;
  onMove?: (firm: Firm, status: Status) => void;
  toughRequest?: number;
}) {
  const [view, setView] = useState<"board" | "list">("board");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<Status | null>(null);
  const [toughOnly, setToughOnly] = useState(false);
  const [q, setQ] = useState("");

  // The top-nav "Tough basket" button bumps toughRequest to jump us here filtered.
  useEffect(() => {
    if (toughRequest > 0) {
      setView("list");
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

  // Owner + search filter shared by both views.
  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (f: Firm) => {
      if (ownerFilter && f.owner !== ownerFilter) return false;
      if (needle) {
        const hay = [f.name, f.contact, f.email, f.note, f.action, f.owner]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    };
  }, [ownerFilter, q]);

  const rows = useMemo(() => {
    return firms
      .filter((f) => {
        if (toughOnly) {
          if (!isTough(f)) return false;
        } else if (!PIPELINE_STATUSES.includes(f.status)) return false;
        if (statusFilter && f.status !== statusFilter) return false;
        return matches(f);
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
  }, [firms, statusFilter, toughOnly, matches, scores]);

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
          {view === "board"
            ? "drag a lead left → right as it progresses"
            : `untouched firms first — ${untouched} with no recorded touchpoint`}
        </span>
      </div>

      <div className="toolbar">
        <div className="viewtoggle">
          <button className={view === "board" ? "on" : ""} onClick={() => setView("board")}>
            ▦ Board
          </button>
          <button className={view === "list" ? "on" : ""} onClick={() => setView("list")}>
            ≣ List
          </button>
        </div>
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

      {view === "board" ? (
        <PipelineBoard firms={firms} matches={matches} onOpen={onOpen} onMove={onMove} />
      ) : (
        <>
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
              These firms have had <b>7 or more points of contact</b> without engaging. We don't
              cross them off — approach with care: change the angle, space out the touches, and lead
              with something genuinely useful to them.
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
                      <td className={`mono${contactCount(f) >= 7 ? " soon" : ""}`}>
                        ×{contactCount(f)}
                      </td>
                      <td className={`mono${gap === null ? " overdue" : gap > 60 ? " soon" : ""}`}>
                        {gap === null ? "never" : `${gap}d ago`}
                      </td>
                      <td className="mono">{fmtDate(f.last_contact)}</td>
                      <td
                        className={`mono${due !== null && due < 0 ? " overdue" : due !== null && due <= 7 ? " soon" : ""}`}
                      >
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
        </>
      )}
    </div>
  );
}

/* ---------------- Board (kanban) ---------------- */

function PipelineBoard({
  firms,
  matches,
  onOpen,
  onMove,
}: {
  firms: Firm[];
  matches: (f: Firm) => boolean;
  onOpen: (firm: Firm) => void;
  onMove?: (firm: Firm, status: Status) => void;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<Status | null>(null);

  const byStage = useMemo(() => {
    const m = new Map<Status, Firm[]>();
    for (const s of BOARD_STAGES) m.set(s, []);
    for (const f of firms) {
      if (!BOARD_STAGES.includes(f.status)) continue; // hides Not Now / Dead
      if (!matches(f)) continue;
      m.get(f.status)!.push(f);
    }
    // freshest attention first: never-contacted, then oldest last-contact
    for (const list of m.values()) {
      list.sort((a, b) => {
        const ac = a.last_contact || "";
        const bc = b.last_contact || "";
        if (!ac && bc) return -1;
        if (ac && !bc) return 1;
        return ac.localeCompare(bc);
      });
    }
    return m;
  }, [firms, matches]);

  function drop(stage: Status) {
    setOverStage(null);
    const f = firms.find((x) => x.id === dragId);
    setDragId(null);
    if (f && f.status !== stage) onMove?.(f, stage);
  }

  return (
    <div className="board">
      {BOARD_STAGES.map((stage) => {
        const cards = byStage.get(stage) ?? [];
        const c = STATUS_STYLE[stage];
        return (
          <div
            key={stage}
            className={`board-col${overStage === stage ? " over" : ""}`}
            onDragOver={(e) => {
              if (!onMove) return;
              e.preventDefault();
              setOverStage(stage);
            }}
            onDragLeave={() => setOverStage((s) => (s === stage ? null : s))}
            onDrop={() => drop(stage)}
          >
            <div className="board-col-h" style={{ borderColor: c.fg }}>
              <span style={{ color: c.fg }}>{stage}</span>
              <span className="cnt">{cards.length}</span>
            </div>
            <div className="board-help" title={STAGE_HELP[stage]}>
              {STAGE_HELP[stage]}
            </div>
            <div className="board-list">
              {cards.map((f) => (
                <div
                  key={f.id}
                  className={`board-card${dragId === f.id ? " dragging" : ""}`}
                  draggable={Boolean(onMove)}
                  onDragStart={() => setDragId(f.id)}
                  onDragEnd={() => {
                    setDragId(null);
                    setOverStage(null);
                  }}
                  onClick={() => onOpen(f)}
                >
                  <div className="bc-name">
                    {f.name || "Untitled"}
                    {isTough(f) && <ToughBadge count={contactCount(f)} />}
                  </div>
                  {f.contact && <div className="bc-sub">{f.contact}</div>}
                  <div className="bc-meta">
                    {f.plan && <span className={`chip plan-${f.plan.toLowerCase()}`}>{f.plan}</span>}
                    {f.fum && <span className="bc-fum">{fmtFum(f.fum)}</span>}
                  </div>
                  <div className="bc-foot">
                    <span className="bc-owner">{f.owner?.split(" ")[0] || "—"}</span>
                    <span className={f.last_contact ? "" : "overdue"}>
                      {f.last_contact ? fmtDate(f.last_contact) : "never touched"}
                    </span>
                  </div>
                </div>
              ))}
              {cards.length === 0 && <div className="board-empty">—</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
