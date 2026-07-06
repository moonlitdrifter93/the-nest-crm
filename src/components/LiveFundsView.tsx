import { useMemo } from "react";
import { daysUntil, fmtDate, fmtFum, fmtRelative, parseFumMillions } from "../lib/format";
import { visibleFunds, type TeamUser } from "../lib/users";
import type { Firm } from "../types";

export function LiveFundsView({
  firms,
  user,
  onOpen,
}: {
  firms: Firm[];
  user: TeamUser;
  onOpen: (firm: Firm) => void;
}) {
  const funds = useMemo(() => visibleFunds(user, firms), [user, firms]);
  const live = funds.filter((f) => f.status === "Live");
  const onboarded = funds.filter((f) => f.status === "Onboarded");

  const scope = user.seesAllFunds
    ? "all funds · full view"
    : `funds allocated to ${listNames(user.fundOwners ?? [user.name])}`;

  return (
    <div>
      <FundTable
        title="Live on The Nest"
        hint={`${live.length} funds · ${scope}`}
        funds={live}
        showOwner
        onOpen={onOpen}
      />
      <FundTable
        title="Onboarded — coming online"
        hint={`${onboarded.length} firms signed, first product pending`}
        funds={onboarded}
        showOwner
        onOpen={onOpen}
      />
    </div>
  );
}

function listNames(names: string[]): string {
  const firsts = names.map((n) => n.split(" ")[0]);
  if (firsts.length <= 1) return firsts.join("");
  return `${firsts.slice(0, -1).join(", ")} & ${firsts[firsts.length - 1]}`;
}

function FundTable({
  title,
  hint,
  funds,
  showOwner,
  onOpen,
}: {
  title: string;
  hint: string;
  funds: Firm[];
  showOwner: boolean;
  onOpen: (firm: Firm) => void;
}) {
  const sorted = useMemo(
    () =>
      [...funds].sort(
        (a, b) =>
          (parseFumMillions(b.fum) ?? -1) - (parseFumMillions(a.fum) ?? -1) ||
          a.name.localeCompare(b.name),
      ),
    [funds],
  );

  return (
    <div style={{ marginBottom: 34 }}>
      <div className="section-h">
        {title}
        <span className="hint">{hint}</span>
      </div>
      {sorted.length === 0 ? (
        <div className="empty">No funds in view.</div>
      ) : (
        <div className="tbl-wrap">
          <table className="grid">
            <thead>
              <tr>
                <th>Fund</th>
                {showOwner && <th>Owner</th>}
                <th>FUM</th>
                <th>Asset classes</th>
                <th>Contact</th>
                <th>Last contact</th>
                <th>Follow-up</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((f) => {
                const due = daysUntil(f.followup);
                return (
                  <tr key={f.id} className="row" onClick={() => onOpen(f)}>
                    <td>{f.name}</td>
                    {showOwner && <td>{f.owner || <span className="sub">—</span>}</td>}
                    <td className="mono">{fmtFum(f.fum)}</td>
                    <td>
                      <span className="sub">{(f.asset_classes ?? []).join(", ") || "—"}</span>
                    </td>
                    <td>
                      {f.contact || <span className="sub">—</span>}
                      {f.email && <div className="sub">{f.email}</div>}
                    </td>
                    <td className="mono">{fmtDate(f.last_contact)}</td>
                    <td
                      className={`mono${
                        due !== null && due < 0 ? " overdue" : due !== null && due <= 7 ? " soon" : ""
                      }`}
                    >
                      {f.followup ? `${fmtDate(f.followup)} (${fmtRelative(f.followup)})` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
