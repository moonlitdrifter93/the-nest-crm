import { useEffect, useMemo, useState } from "react";
import { fmtDate, todayISO } from "../lib/format";
import type { TeamUser } from "../lib/users";
import type { Deal, Firm } from "../types";
import { StatusBadge } from "./StatusBadge";

/*
 * Master — Matthew's private deal book: firms allocated to him or tagged
 * Placement, reduced to Name / Type / Amount / Update. Amount and update are
 * edited inline and stored in the `deals` table, whose row-level security
 * only answers to the admin's account — the figures never reach anyone
 * else's browser.
 */

export function MasterView({
  firms,
  user,
  deals,
  onSaveDeal,
  onOpen,
}: {
  firms: Firm[];
  user: TeamUser;
  deals: Record<string, Deal>;
  onSaveDeal: (deal: Deal) => void;
  onOpen: (firm: Firm) => void;
}) {
  const rows = useMemo(
    () =>
      firms
        .filter(
          (f) =>
            f.owner === user.name ||
            (f.owners ?? []).includes(user.name) ||
            f.is_placement,
        )
        .sort((a, b) => {
          const au = deals[a.id]?.update_at || "";
          const bu = deals[b.id]?.update_at || "";
          if (au !== bu) return bu.localeCompare(au); // freshest update first
          return a.name.localeCompare(b.name);
        }),
    [firms, user, deals],
  );

  return (
    <div>
      <div className="section-h">
        Master — deal book
        <span className="hint">
          {rows.length} deals · allocated to {user.name.split(" ")[0]} or tagged placement ·
          amounts &amp; updates are database-locked to your account
        </span>
      </div>

      <div className="tbl-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th style={{ width: 130 }}>Amount</th>
              <th style={{ minWidth: 260 }}>Update</th>
              <th>Stage</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((f) => (
              <DealRow
                key={f.id}
                firm={f}
                deal={deals[f.id]}
                onSaveDeal={onSaveDeal}
                onOpen={onOpen}
              />
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="empty">No deals allocated yet.</div>}
      </div>
    </div>
  );
}

function DealRow({
  firm,
  deal,
  onSaveDeal,
  onOpen,
}: {
  firm: Firm;
  deal?: Deal;
  onSaveDeal: (deal: Deal) => void;
  onOpen: (firm: Firm) => void;
}) {
  const [amount, setAmount] = useState(deal?.amount ?? "");
  const [update, setUpdate] = useState(deal?.update_text ?? "");

  useEffect(() => {
    setAmount(deal?.amount ?? "");
    setUpdate(deal?.update_text ?? "");
  }, [deal]);

  function commit() {
    const prevAmount = deal?.amount ?? "";
    const prevUpdate = deal?.update_text ?? "";
    if (amount === prevAmount && update === prevUpdate) return;
    onSaveDeal({
      firm_id: firm.id,
      amount: amount.trim(),
      update_text: update.trim(),
      update_at: update.trim() !== prevUpdate ? todayISO() : deal?.update_at ?? todayISO(),
    });
  }

  return (
    <tr>
      <td className="row" onClick={() => onOpen(firm)} style={{ cursor: "pointer" }}>
        {firm.name}
      </td>
      <td>
        <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {firm.is_placement && <span className="chip hot">Placement</span>}
          {firm.plan && (
            <span className={`chip plan-${firm.plan.toLowerCase()}`}>{firm.plan}</span>
          )}
          {!firm.is_placement && !firm.plan && <span className="sub">—</span>}
        </span>
      </td>
      <td>
        <input
          className="mono"
          placeholder="$2M"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        />
      </td>
      <td>
        <input
          placeholder="Latest update…"
          value={update}
          onChange={(e) => setUpdate(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        />
        {deal?.update_at && <div className="sub">{fmtDate(deal.update_at)}</div>}
      </td>
      <td>
        <StatusBadge status={firm.status} />
      </td>
    </tr>
  );
}
