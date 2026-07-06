import { STATUS_STYLE, type Status } from "../types";

export function StatusBadge({ status }: { status: Status }) {
  const s = STATUS_STYLE[status] ?? { fg: "#b8b098", bg: "#201e18" };
  return (
    <span className="badge" style={{ color: s.fg, background: s.bg }}>
      {status}
    </span>
  );
}
