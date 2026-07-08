import { STATUS_STYLE, type Status } from "../types";

export function StatusBadge({ status }: { status: Status }) {
  const s = STATUS_STYLE[status] ?? { fg: "#b8b098", bg: "#201e18" };
  return (
    <span className="badge" style={{ color: s.fg, background: s.bg }}>
      {status}
    </span>
  );
}

// "Tough basket" — many contacts, still cold. Handle with care.
export function ToughBadge({ count }: { count: number }) {
  return (
    <span className="badge" style={{ color: "#d0a878", background: "#2a1e12" }} title={`${count} points of contact, still cold — approach with care`}>
      🪺 tough ·{count}
    </span>
  );
}
