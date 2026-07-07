import { useMemo } from "react";
import { fmtDate } from "../lib/format";
import type { TeamUser } from "../lib/users";
import type { Firm } from "../types";
import { StatusBadge } from "./StatusBadge";

/*
 * Master — Matthew's private deal book. Every firm allocated to him, reduced
 * to the essentials: name, type (Placement and/or PPR/Enterprise), amount,
 * and the latest update. The tab is only rendered for the admin user.
 */

export function MasterView({
  firms,
  user,
  onOpen,
}: {
  firms: Firm[];
  user: TeamUser;
  onOpen: (firm: Firm) => void;
}) {
  const deals = useMemo(
    () =>
      firms
        .filter(
          (f) =>
            f.owner === user.name ||
            (f.owners ?? []).includes(user.name) ||
            f.is_placement,
        )
        .sort((a, b) => {
          const au = a.deal_update_at || "";
          const bu = b.deal_update_at || "";
          if (au !== bu) return bu.localeCompare(au); // freshest update first
          return a.name.localeCompare(b.name);
        }),
    [firms, user],
  );

  return (
    <div>
      <div className="section-h">
        Master — deal book
        <span className="hint">
          {deals.length} deals · allocated to {user.name.split(" ")[0]} or tagged placement ·
          private view
        </span>
      </div>

      <div className="tbl-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Amount</th>
              <th>Update</th>
              <th>Stage</th>
            </tr>
          </thead>
          <tbody>
            {deals.map((f) => (
              <tr key={f.id} className="row" onClick={() => onOpen(f)}>
                <td>{f.name}</td>
                <td>
                  <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {f.is_placement && <span className="chip hot">Placement</span>}
                    {f.plan && (
                      <span className={`chip plan-${f.plan.toLowerCase()}`}>{f.plan}</span>
                    )}
                    {!f.is_placement && !f.plan && <span className="sub">—</span>}
                  </span>
                </td>
                <td className="mono">{f.deal_amount?.trim() || "—"}</td>
                <td>
                  {f.deal_update?.trim() ? (
                    <>
                      {f.deal_update}
                      {f.deal_update_at && (
                        <div className="sub">{fmtDate(f.deal_update_at)}</div>
                      )}
                    </>
                  ) : (
                    <span className="sub">no update logged</span>
                  )}
                </td>
                <td>
                  <StatusBadge status={f.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {deals.length === 0 && <div className="empty">No deals allocated yet.</div>}
      </div>
    </div>
  );
}
