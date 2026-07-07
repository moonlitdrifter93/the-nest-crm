import { useMemo } from "react";
import { fmtDate } from "../lib/format";
import type { SpifEvent } from "../lib/store";
import type { TeamUser } from "../lib/users";

/*
 * SPIF — how many funds are being closed. Events are logged automatically
 * whenever a firm's stage is moved to Onboarded (signed) or Live (first
 * product up), so the numbers accrue as the team works.
 */

export function SpifView({
  events,
  user,
  onDelete,
}: {
  events: SpifEvent[];
  user: TeamUser;
  onDelete: (ev: SpifEvent) => void;
}) {
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
      monthByOwner: [...events.filter((e) => inRange(e, startOfMonth))
        .reduce((m, e) => m.set(e.owner || "Unassigned", (m.get(e.owner || "Unassigned") ?? 0) + 1), new Map<string, number>())
        .entries()].sort((a, b) => b[1] - a[1]),
    };
  }, [events, now]);

  return (
    <div className="prio-grid">
      <div>
        <div className="section-h">
          Closes
          <span className="hint">
            logged automatically when a firm moves to Onboarded or Live
          </span>
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

        {events.length === 0 ? (
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
                {events.map((e) => (
                  <tr key={`${e.id ?? e.ts}-${e.firm_id}`}>
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
                    <td>
                      {user.seesAllFunds && (
                        <button
                          className="sub"
                          title="Remove (mis-log)"
                          onClick={() => onDelete(e)}
                          style={{ color: "var(--red)" }}
                        >
                          ×
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
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
