import { useMemo, useState } from "react";
import { daysUntil, fmtDate, fmtFum, fmtRelative, parseFumMillions } from "../lib/format";
import { closeQueue } from "../lib/score";
import { ASSET_CLASSES, OWNERS, STATUSES, type Firm, type Status } from "../types";
import { StatusBadge } from "./StatusBadge";

type SortKey = "name" | "status" | "owner" | "fum" | "last_contact" | "followup" | "score";

const STATUS_ORDER: Record<string, number> = Object.fromEntries(
  STATUSES.map((s, i) => [s, i]),
);

export function PipelineView({
  firms,
  onOpen,
  onAdd,
}: {
  firms: Firm[];
  onOpen: (firm: Firm) => void;
  onAdd: () => void;
}) {
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<Status | null>(null);
  const [ownerFilter, setOwnerFilter] = useState("");
  const [acFilter, setAcFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);

  const scores = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of closeQueue(firms)) m.set(s.firm.id, s.score);
    return m;
  }, [firms]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of firms) m.set(f.status, (m.get(f.status) ?? 0) + 1);
    return m;
  }, [firms]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = firms.filter((f) => {
      if (statusFilter && f.status !== statusFilter) return false;
      if (ownerFilter && f.owner !== ownerFilter) return false;
      if (acFilter && !(f.asset_classes ?? []).includes(acFilter)) return false;
      if (needle) {
        const hay = [
          f.name,
          f.contact,
          f.email,
          f.note,
          f.action,
          f.owner,
          ...(f.asset_classes ?? []),
          ...(f.contacts ?? []).map((c) => c.name ?? ""),
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });

    const dir = sortDir;
    out = [...out].sort((a, b) => {
      switch (sortKey) {
        case "name":
          return dir * a.name.localeCompare(b.name);
        case "status":
          return dir * ((STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99));
        case "owner":
          return dir * (a.owner || "~").localeCompare(b.owner || "~");
        case "fum":
          return dir * ((parseFumMillions(a.fum) ?? -1) - (parseFumMillions(b.fum) ?? -1));
        case "last_contact":
          return dir * (a.last_contact || "").localeCompare(b.last_contact || "");
        case "followup":
          return dir * (a.followup || "9999").localeCompare(b.followup || "9999");
        case "score":
          return dir * ((scores.get(a.id) ?? -1) - (scores.get(b.id) ?? -1));
      }
    });
    return out;
  }, [firms, q, statusFilter, ownerFilter, acFilter, sortKey, sortDir, scores]);

  function clickSort(k: SortKey) {
    if (k === sortKey) setSortDir(sortDir === 1 ? -1 : 1);
    else {
      setSortKey(k);
      setSortDir(k === "name" || k === "owner" ? 1 : -1);
    }
  }

  const arrow = (k: SortKey) => (sortKey === k ? (sortDir === 1 ? " ↑" : " ↓") : "");

  return (
    <div>
      <div className="toolbar">
        <input
          type="search"
          placeholder="Search firms, people, notes…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)}>
          <option value="">All owners</option>
          {OWNERS.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
        <select value={acFilter} onChange={(e) => setAcFilter(e.target.value)}>
          <option value="">All asset classes</option>
          {ASSET_CLASSES.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
        <div style={{ flex: 1 }} />
        <button className="btn primary" onClick={onAdd}>
          + Add firm
        </button>
      </div>

      <div className="fchips">
        <button className={statusFilter === null ? "on" : ""} onClick={() => setStatusFilter(null)}>
          All {firms.length}
        </button>
        {STATUSES.map((s) => (
          <button
            key={s}
            className={statusFilter === s ? "on" : ""}
            onClick={() => setStatusFilter(statusFilter === s ? null : s)}
          >
            {s} {counts.get(s) ?? 0}
          </button>
        ))}
      </div>

      <div className="tbl-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th onClick={() => clickSort("name")}>Firm{arrow("name")}</th>
              <th onClick={() => clickSort("status")}>Stage{arrow("status")}</th>
              <th onClick={() => clickSort("owner")}>Owner{arrow("owner")}</th>
              <th onClick={() => clickSort("fum")}>FUM{arrow("fum")}</th>
              <th>Asset classes</th>
              <th onClick={() => clickSort("last_contact")}>Last contact{arrow("last_contact")}</th>
              <th onClick={() => clickSort("followup")}>Follow-up{arrow("followup")}</th>
              <th onClick={() => clickSort("score")}>Score{arrow("score")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((f) => {
              const due = daysUntil(f.followup);
              return (
                <tr key={f.id} className="row" onClick={() => onOpen(f)}>
                  <td>
                    {f.name}
                    {f.contact && <div className="sub">{f.contact}</div>}
                  </td>
                  <td>
                    <StatusBadge status={f.status} />
                  </td>
                  <td>{f.owner || <span className="sub">—</span>}</td>
                  <td className="mono">{fmtFum(f.fum)}</td>
                  <td>
                    <span className="sub">{(f.asset_classes ?? []).join(", ") || "—"}</span>
                  </td>
                  <td className="mono">{fmtDate(f.last_contact)}</td>
                  <td className={`mono${due !== null && due < 0 ? " overdue" : due !== null && due <= 7 ? " soon" : ""}`}>
                    {f.followup ? `${fmtDate(f.followup)} (${fmtRelative(f.followup)})` : "—"}
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
