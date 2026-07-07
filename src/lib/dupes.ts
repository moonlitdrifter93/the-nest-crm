import type { Firm } from "../types";

/*
 * Duplicate firm detection and merge. Pairs are flagged when their
 * normalised names are equal, one contains the other, or they're within
 * edit distance 2 (catches typos like "Equiora" vs "Equoira").
 */

function norm(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

// Generic finance words carry no identity — "AL Capital" vs "Ark Capital"
// must be compared as "al" vs "ark", not on the shared "capital".
const GENERIC =
  /\b(capital|partners?|group|management|managers?|asset|assets|funds?|invest(?:ments?)?|advisors?|advisory|securities|private|equity|ventures?|holdings?|pty|ltd|limited|co)\b/g;

function core(name: string): string {
  return norm(name.toLowerCase().replace(GENERIC, " "));
}

// Optimal string alignment distance (edit distance where a transposition
// counts as one operation — catches "Equiora" vs "Equoira").
function osaDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = [];
  for (let i = 0; i <= a.length; i++) d.push([i, ...new Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

export interface DupePair {
  a: Firm;
  b: Firm;
  reason: string;
}

export function findDupes(firms: Firm[], dismissed: Set<string>): DupePair[] {
  const out: DupePair[] = [];
  const entries = firms
    .map((f) => ({ f, n: norm(f.name), c: core(f.name) }))
    .filter((e) => e.n.length >= 4);
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const { f: a, n: na, c: ca } = entries[i];
      const { f: b, n: nb, c: cb } = entries[j];
      if (dismissed.has(pairKey(a, b))) continue;
      let reason = "";
      if (na === nb) reason = "identical names";
      else if (ca.length >= 4 && ca === cb) reason = "same name apart from generic words";
      else if (ca.length >= 5 && cb.length >= 5 && (ca.includes(cb) || cb.includes(ca))) {
        reason = "one name contains the other";
      } else if (
        ca.length >= 5 &&
        cb.length >= 5 &&
        ca[0] === cb[0] &&
        osaDistance(ca, cb, ca.length >= 8 ? 2 : 1) <= (ca.length >= 8 ? 2 : 1)
      ) {
        reason = "near-identical spelling";
      }
      if (reason) out.push({ a, b, reason });
    }
  }
  return out;
}

export function pairKey(a: Firm, b: Firm): string {
  return [a.id, b.id].sort().join("|");
}

// Merge b into a: keep a's non-empty fields, fill gaps from b, union the
// lists, concatenate notes. Returns the merged firm (caller deletes b).
export function mergeFirms(a: Firm, b: Firm): Firm {
  const take = <K extends keyof Firm>(k: K): Firm[K] =>
    (a[k] !== undefined && a[k] !== "" && a[k] !== null ? a[k] : b[k]) as Firm[K];
  const note = [a.note?.trim(), b.note?.trim() ? `— merged from "${b.name}" —\n${b.note?.trim()}` : ""]
    .filter(Boolean)
    .join("\n\n");
  return {
    ...b,
    ...a,
    contact: take("contact"),
    title: take("title"),
    email: take("email"),
    phone: take("phone"),
    li: take("li"),
    website: take("website"),
    fum: take("fum"),
    owner: take("owner"),
    plan: take("plan"),
    action: take("action"),
    last_contact: [a.last_contact, b.last_contact].filter(Boolean).sort().pop(),
    followup: [a.followup, b.followup].filter(Boolean).sort()[0],
    asset_classes: [...new Set([...(a.asset_classes ?? []), ...(b.asset_classes ?? [])])],
    contacts: [...(a.contacts ?? []), ...(b.contacts ?? [])],
    owners: [...new Set([...(a.owners ?? []), ...(b.owners ?? [])])],
    has_deal: a.has_deal || b.has_deal,
    is_placement: a.is_placement || b.is_placement,
    is_family_office: a.is_family_office || b.is_family_office,
    note,
  };
}
