import type { Firm } from "../types";
import { daysUntil } from "./format";

/*
 * Priority scoring — surfaces the firms worth acting on next.
 *
 * Three signal groups, per the team's criteria:
 *   1. Sign-up propensity  — how likely the firm is to sign quickly
 *   2. Asset-class gap     — whether signing it fills a hole in platform coverage
 *   3. Action & link       — a defined next action, a follow-up on the books,
 *                            and a direct line to a person
 *
 * Every point carries a human-readable reason so the ranking is never a black box.
 */

export interface Reason {
  label: string;
  pts: number;
  kind: "hot" | "gap" | "due" | "ok";
}

export interface ScoredFirm {
  firm: Firm;
  score: number;
  reasons: Reason[];
}

// Count of Live/Onboarded firms per asset class = current platform coverage.
export function platformCoverage(firms: Firm[]): Map<string, number> {
  const cov = new Map<string, number>();
  for (const f of firms) {
    if (f.status !== "Live" && f.status !== "Onboarded") continue;
    for (const ac of f.asset_classes ?? []) {
      cov.set(ac, (cov.get(ac) ?? 0) + 1);
    }
  }
  return cov;
}

function gapPoints(coverage: number): number {
  if (coverage === 0) return 25;
  if (coverage === 1) return 18;
  if (coverage === 2) return 12;
  if (coverage <= 4) return 6;
  return 0;
}

const CLOSING_SIGNALS = /\b(agreement|docusign|contract|ready to (sign|confirm|go live)|signed?|onboard)/i;

export function scoreFirm(firm: Firm, coverage: Map<string, number>): ScoredFirm {
  const reasons: Reason[] = [];
  const signed = firm.status === "Live" || firm.status === "Onboarded";

  // --- 1. Sign-up propensity ---
  if (firm.status === "Active") {
    reasons.push({ label: "Active — in live discussions", pts: 30, kind: "hot" });
  } else if (firm.status === "Engaged") {
    reasons.push({ label: "Engaged — responding", pts: 22, kind: "hot" });
  } else if (firm.status === "Prospecting") {
    reasons.push({ label: "Prospecting", pts: 5, kind: "ok" });
  }

  if (!signed && firm.has_deal) {
    reasons.push({ label: "Has a deal to list", pts: 10, kind: "hot" });
  }

  const sinceContact = firm.last_contact ? -(daysUntil(firm.last_contact) ?? 0) : null;
  if (!signed && sinceContact !== null && sinceContact >= 0) {
    if (sinceContact <= 14) {
      reasons.push({ label: "Warm — contacted in last 2 weeks", pts: 6, kind: "hot" });
    } else if (sinceContact <= 30) {
      reasons.push({ label: "Contacted in last month", pts: 3, kind: "ok" });
    }
  }

  if (!signed && firm.note && CLOSING_SIGNALS.test(firm.note)) {
    reasons.push({ label: "Closing signals in notes", pts: 8, kind: "hot" });
  }

  // --- 2. Asset-class gap fill ---
  if (!signed) {
    let best: { ac: string; cov: number; pts: number } | null = null;
    for (const ac of firm.asset_classes ?? []) {
      const cov = coverage.get(ac) ?? 0;
      const pts = gapPoints(cov);
      if (pts > 0 && (!best || pts > best.pts)) best = { ac, cov, pts };
    }
    if (best) {
      reasons.push({
        label:
          best.cov === 0
            ? `Fills empty class: ${best.ac}`
            : `Thin coverage: ${best.ac} (${best.cov} live)`,
        pts: best.pts,
        kind: "gap",
      });
    }
  }

  // --- 3. Action & link ---
  const due = daysUntil(firm.followup);
  if (due !== null) {
    if (due < 0) {
      reasons.push({ label: `Follow-up ${-due}d overdue`, pts: 15, kind: "due" });
    } else if (due <= 7) {
      reasons.push({ label: due === 0 ? "Follow-up due today" : `Follow-up in ${due}d`, pts: 10, kind: "due" });
    } else {
      reasons.push({ label: "Follow-up scheduled", pts: 4, kind: "ok" });
    }
  }

  if (firm.action?.trim()) {
    reasons.push({ label: "Next action defined", pts: 8, kind: "ok" });
  }

  if (firm.email?.trim()) {
    reasons.push({ label: "Direct email on file", pts: 4, kind: "ok" });
  }
  if (firm.li?.trim() || firm.website?.trim()) {
    reasons.push({ label: "LinkedIn / site linked", pts: 3, kind: "ok" });
  }

  const score = reasons.reduce((s, r) => s + r.pts, 0);
  return { firm, score, reasons };
}

// The close queue: unsigned pipeline (Active/Engaged/Prospecting), ranked.
export function closeQueue(firms: Firm[]): ScoredFirm[] {
  const coverage = platformCoverage(firms);
  return firms
    .filter((f) => f.status === "Active" || f.status === "Engaged" || f.status === "Prospecting")
    .map((f) => scoreFirm(f, coverage))
    .sort((a, b) => b.score - a.score || a.firm.name.localeCompare(b.firm.name));
}

// Signed firms (Live/Onboarded) that still need attention: an overdue or
// imminent follow-up, or an open action.
export function upkeepQueue(firms: Firm[]): ScoredFirm[] {
  const out: ScoredFirm[] = [];
  for (const f of firms) {
    if (f.status !== "Live" && f.status !== "Onboarded") continue;
    const due = daysUntil(f.followup);
    const reasons: Reason[] = [];
    if (due !== null && due < 0) reasons.push({ label: `Follow-up ${-due}d overdue`, pts: 15, kind: "due" });
    else if (due !== null && due <= 7) reasons.push({ label: due === 0 ? "Follow-up due today" : `Follow-up in ${due}d`, pts: 10, kind: "due" });
    if (f.action?.trim()) reasons.push({ label: "Open action", pts: 8, kind: "ok" });
    if (reasons.length === 0) continue;
    out.push({ firm: f, score: reasons.reduce((s, r) => s + r.pts, 0), reasons });
  }
  return out.sort((a, b) => b.score - a.score || a.firm.name.localeCompare(b.firm.name));
}
