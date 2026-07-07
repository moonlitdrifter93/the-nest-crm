import { useMemo, useState } from "react";
import { fmtDate } from "../lib/format";
import type { SpifEvent } from "../lib/store";
import type { TeamUser } from "../lib/users";
import { OWNERS } from "../types";

/*
 * SPIF — how many funds are being closed. Closes auto-log whenever a firm's
 * stage moves to Onboarded or Live. The admin can additionally add manual
 * entries, edit any row inline, and delete mis-logs (all admin-only at the
 * database level too).
 */

export function SpifView({
  events,
  user,
  onAdd,
  onUpdate,
  onDelete,
}: {
  events: SpifEvent[];
  user: TeamUser;
  onAdd: (ev: SpifEvent) => void;
  onUpdate: (ev: SpifEvent) => void;
  onDelete: (ev: SpifEvent) => void;
}) {
  const isAdmin = user.seesAllFunds;
  const [adding, setAdding] = useState(false);
  const [editKey, setEditKey] = useState<string | null>(null);
  const now = new Date();

  const stats = useMemo(() => {
    const startOfWeek = new Date(now);
    const day = (now.getDay() + 6) % 7; // Monday start
    startOfWeek.setDate(now.getDate() - day);
    startOfWeek.setHours(0, 0, 0, 0);
    const startOfLastWeek = new Date(startOfWeek);
    startOfLastWeek.setDate(startOfWeek.getDate() - 7);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const inRange = (e: SpifEvent, from: Date, to?: Date) => {
      const t = new Date(e.ts).getTime();
      return t >= from.getTime() && (!to || t < to.getTime());
    };

    return {
      thisWeek: events.filter((e) => inRange(e, startOfWeek)).length,
      lastWeek: events.filter((e) => inRange(e, startOfLastWeek, startOfWeek)).length,
      thisMonth: events.filter((e) => inRange(e, startOfMonth)).length,
      allTime: events.length,
      monthByOwner: [
        ...events
          .filter((e) => inRange(e, startOfMonth))
          .reduce(
            (m, e) => m.set(e.owner || "Unassigned", (m.get(e.owner || "Unassigned") ?? 0) + 1),
            new Map<string, number>(),
          )
          .entries(),
      ].sort((a, b) => b[1] - a[1]),
    };
  }, [events, now]);

  const keyOf = (e: SpifEvent) => `${e.id ?? e.ts}-${e.firm_id}`;

  return (
    <div className="prio-grid">
      <div>
        <div className="section-h">
          Closes
          <span className="hint">auto-logged when a firm moves to Onboarded or Live</span>
          <div style={{ flex: 1 }} />
          {isAdmin && (
            <button className="btn primary" onClick={() => setAdding(true)}>
              + Log close
            </button>
          )}
        </div>

        <div className="stats">
          <div className="stat">
            <div className="n" style={{ color: "#6ec98a" }}>{stats.thisWeek}</div>
            <div className="l">This week</div>
          </div>
          <div className="stat">
            <div className="n">{stats.lastWeek}</div>
            <div className="l">Last week</div>
          </div>
          <div className="stat">
            <div className="n" style={{ color: "#c8a86a" }}>{stats.thisMonth}</div>
            <div className="l">This month</div>
          </div>
          <div className="stat">
            <div className="n">{stats.allTime}</div>
            <div className="l">All time</div>
          </div>
        </div>

        {adding && (
          <SpifEditor
            onSave={(ev) => {
              onAdd({ ...ev, logged_by: user.name });
              setAdding(false);
            }}
            onCancel={() => setAdding(false)}
          />
        )}

        {events.length === 0 && !adding ? (
          <div className="notice">
            Nothing logged yet. Move a firm's stage to <b>Onboarded</b> when the agreement is
            signed, or <b>Live</b> when its first product is up — it lands here automatically
            with the owner credited.
          </div>
        ) : (
          <div className="tbl-wrap">
            <table className="grid">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Firm</th>
                  <th>Close type</th>
                  <th>Owner</th>
                  <th>Logged by</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) =>
                  editKey === keyOf(e) ? (
                    <tr key={keyOf(e)}>
                      <td colSpan={6}>
                        <SpifEditor
                          initial={e}
                          onSave={(next) => {
                            onUpdate({ ...e, ...next });
                            setEditKey(null);
                          }}
                          onCancel={() => setEditKey(null)}
                        />
                      </td>
                    </tr>
                  ) : (
                    <tr key={keyOf(e)}>
                      <td className="mono">{fmtDate(e.ts.slice(0, 10))}</td>
                      <td>{e.firm_name}</td>
                      <td>
                        <span
                          className="badge"
                          style={
                            e.kind === "Live"
                              ? { color: "#6ec98a", background: "#0a2414" }
                              : { color: "#4db8a0", background: "#062018" }
                          }
                        >
                          {e.kind}
                        </span>
                      </td>
                      <td>{e.owner || <span className="sub">—</span>}</td>
                      <td className="sub">{e.logged_by || "—"}</td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {isAdmin && (
                          <>
                            <button
                              className="dbtn"
                              title="Edit"
                              onClick={() => setEditKey(keyOf(e))}
                            >
                              ✎
                            </button>{" "}
                            <button
                              className="dbtn danger"
                              title="Remove"
                              onClick={() => onDelete(e)}
                            >
                              ×
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <div className="panel">
          <h3>This month — by owner</h3>
          <div className="sub">who's closing</div>
          {stats.monthByOwner.length === 0 && <div className="empty">No closes yet.</div>}
          {stats.monthByOwner.map(([owner, n]) => (
            <div key={owner} className="gaprow" style={{ cursor: "default" }}>
              <span className="ac">{owner}</span>
              <span className="cov">{n}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SpifEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial?: SpifEvent;
  onSave: (ev: SpifEvent) => void;
  onCancel: () => void;
}) {
  const [date, setDate] = useState(initial?.ts.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
  const [firm, setFirm] = useState(initial?.firm_name ?? "");
  const [kind, setKind] = useState<"Onboarded" | "Live">(initial?.kind ?? "Onboarded");
  const [owner, setOwner] = useState(initial?.owner ?? "");

  return (
    <div className="toolbar" style={{ background: "var(--bg3)", borderRadius: 10, padding: 10 }}>
      <input type="date" style={{ width: 150 }} value={date} onChange={(e) => setDate(e.target.value)} />
      <input
        placeholder="Firm name"
        style={{ maxWidth: 240 }}
        value={firm}
        onChange={(e) => setFirm(e.target.value)}
      />
      <select value={kind} onChange={(e) => setKind(e.target.value as "Onboarded" | "Live")}>
        <option>Onboarded</option>
        <option>Live</option>
      </select>
      <select value={owner} onChange={(e) => setOwner(e.target.value)}>
        <option value="">Owner…</option>
        {OWNERS.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
      <button
        className="btn primary"
        onClick={() => {
          if (!firm.trim()) return;
          onSave({
            id: initial?.id,
            ts: `${date}T12:00:00.000Z`,
            firm_id: initial?.firm_id ?? `manual-${Date.now()}`,
            firm_name: firm.trim(),
            kind,
            owner: owner || undefined,
            logged_by: initial?.logged_by,
          });
        }}
      >
        Save
      </button>
      <button className="btn" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}
