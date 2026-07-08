import type { Firm } from "../types";

/*
 * Contact-level tracking and the "tough basket".
 *
 * A firm that has been approached many times without engaging isn't a lost
 * cause — we don't cross it off, we move it to the tough basket and approach
 * with more care. The trigger is 7+ points of contact while the firm is still
 * cold (Prospecting / Not Now).
 *
 * The contact count is explicit (firm.contact_count) once anyone logs a
 * touchpoint; before that it's estimated from the notes so historical firms
 * still surface. The number is editable in the drawer.
 */

export const TOUGH_THRESHOLD = 7;

// Precise touchpoints we log ourselves: "7 July 2026 — call — Matthew".
const LOGGED_LINE = /^\d{1,2} \w+ \d{4} — (call|email|meeting) —/gim;

// Contact verbs in free-text notes (historical estimate only).
const PROSE_SIGNAL =
  /\b(called|calling|phoned|emailed|e-mailed|spoke|speaking|met with|meeting|reached out|followed up|follow[- ]up|caught up|catch up|sent (?:an? )?(?:email|note|message|follow)|contacted|chased|touch base|touched base|rang)\b/gi;

export function estimateContacts(firm: Firm): number {
  const note = firm.note ?? "";
  const logged = (note.match(LOGGED_LINE) ?? []).length;
  if (logged > 0) return logged;
  // fall back to a capped prose estimate so fuzzy history can't over-trigger
  const prose = (note.match(PROSE_SIGNAL) ?? []).length;
  return Math.min(prose, 10);
}

export function contactCount(firm: Firm): number {
  return firm.contact_count ?? estimateContacts(firm);
}

// Whether the count is a real logged number vs an estimate from notes.
export function isEstimated(firm: Firm): boolean {
  return firm.contact_count === undefined;
}

const COLD: Firm["status"][] = ["Prospecting", "Not Now"];

export function isTough(firm: Firm): boolean {
  return contactCount(firm) >= TOUGH_THRESHOLD && COLD.includes(firm.status);
}

export function toughFirms(firms: Firm[]): Firm[] {
  return firms
    .filter(isTough)
    .sort((a, b) => contactCount(b) - contactCount(a) || a.name.localeCompare(b.name));
}
