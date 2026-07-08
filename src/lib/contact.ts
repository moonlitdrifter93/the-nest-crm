import type { Firm } from "../types";

/*
 * Contact-level tracking and the "tough basket".
 *
 * A firm is "tough" when it's been chased repeatedly with no real response —
 * we don't cross it off, we handle it with more care. But lots of touchpoints
 * alone doesn't mean cold: a back-and-forth (replies, inbound emails, a booked
 * meeting) is a warm sign. So the auto rule only flags a firm that's been
 * contacted many times *without* any two-way signal.
 *
 * Above all it's manual: firm.tough = true/false is an explicit override the
 * team sets, and it always wins over the auto guess.
 */

export const TOUGH_THRESHOLD = 6;

// Precise touchpoints we log ourselves: "7 July 2026 — call — Matthew".
const LOGGED_LINE = /^\d{1,2} \w+ \d{4} — (call|email|meeting|linkedin) —/gim;

// Contact verbs in free-text notes (historical estimate only).
const PROSE_SIGNAL =
  /\b(called|calling|phoned|emailed|e-mailed|spoke|speaking|met with|meeting|reached out|followed up|follow[- ]up|caught up|catch up|sent (?:an? )?(?:email|note|message|follow)|contacted|chased|touch base|touched base|rang)\b/gi;

// Two-way / positive signals — presence means "warm", not tough.
const WARM_SIGNAL =
  /(—\s*email\s*—\s*from)|(↙)|(\breplied\b)|(\brespond(?:ed|ing)?\b)|(got back)|(came back)|(\bkeen\b)|(\binterested\b)|(happy to)|(keen to)|(wants? to)|(let'?s\s)|(booked)|(will (?:call|meet|catch))|(agreed to)/i;

export function estimateContacts(firm: Firm): number {
  const note = firm.note ?? "";
  const logged = (note.match(LOGGED_LINE) ?? []).length;
  if (logged > 0) return logged;
  const prose = (note.match(PROSE_SIGNAL) ?? []).length;
  return Math.min(prose, 10);
}

export function contactCount(firm: Firm): number {
  return firm.contact_count ?? estimateContacts(firm);
}

export function isEstimated(firm: Firm): boolean {
  return firm.contact_count === undefined;
}

export function hasWarmSignal(firm: Firm): boolean {
  return WARM_SIGNAL.test(firm.note ?? "") || Boolean(firm.has_deal);
}

// Statuses where "tough" is meaningful (still being worked, not signed/dead).
const ACTIONABLE: Firm["status"][] = ["Prospecting", "Not Now", "Active", "Engaged"];

// Auto guess: many touchpoints, actionable stage, and no two-way signal.
export function autoTough(firm: Firm): boolean {
  if (!ACTIONABLE.includes(firm.status)) return false;
  if (contactCount(firm) < TOUGH_THRESHOLD) return false;
  return !hasWarmSignal(firm);
}

// Manual override wins; otherwise fall back to the auto guess.
export function isTough(firm: Firm): boolean {
  return firm.tough !== undefined ? firm.tough : autoTough(firm);
}

// Whether the current tough state was set by hand vs inferred.
export function isToughManual(firm: Firm): boolean {
  return firm.tough !== undefined;
}

export function toughFirms(firms: Firm[]): Firm[] {
  return firms
    .filter(isTough)
    .sort((a, b) => contactCount(b) - contactCount(a) || a.name.localeCompare(b.name));
}
