// Parse FUM strings like "$500M AUM", "$1.2B", "$50m" into millions (AUD).
export function parseFumMillions(fum?: string): number | null {
  if (!fum) return null;
  const m = fum.replace(/,/g, "").match(/\$?\s*([\d.]+)\s*(b|bn|billion|m|mn|million|k)?/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (Number.isNaN(n)) return null;
  const unit = (m[2] || "m").toLowerCase();
  if (unit.startsWith("b")) return n * 1000;
  if (unit === "k") return n / 1000;
  return n;
}

export function fmtFum(fum?: string): string {
  const m = parseFumMillions(fum);
  if (m === null) return fum?.trim() || "—";
  if (m >= 1000) return `$${(m / 1000).toFixed(m % 1000 === 0 ? 0 : 1)}B`;
  return `$${Math.round(m)}M`;
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// Days from today to an ISO date; negative = in the past.
export function daysUntil(iso?: string): number | null {
  if (!iso) return null;
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - now.getTime()) / 86400000);
}

export function fmtDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

export function fmtRelative(iso?: string): string {
  const days = daysUntil(iso);
  if (days === null) return "—";
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  if (days < 0) return `${-days}d overdue`;
  return `in ${days}d`;
}
