import type { Firm } from "../types";

/*
 * Team sign-in and fund visibility.
 *
 * Matthew (Managing Principal) sees every live fund. Raph and Jack work as a
 * pod: each sees the funds allocated to either of them. Tim sees his own.
 *
 * With Supabase configured, sign-in is a real Supabase Auth account (email +
 * password, session managed server-side) and the database only answers to
 * authenticated team members. The DEFAULT_PW picker below applies to local/dev
 * mode only. Which FUNDS a signed-in teammate sees is still decided in the
 * client — teammates are trusted; tighten with per-row RLS later if needed.
 */

export interface TeamUser {
  id: string;
  name: string; // must match Firm.owner values
  email?: string;
  seesAllFunds: boolean;
  fundOwners?: string[]; // owners whose funds are visible when not seesAllFunds
}

// Emails other than Matthew's follow the firstname.lastname@ pattern —
// correct them here if an address differs before creating the auth accounts.
export const TEAM: TeamUser[] = [
  {
    id: "matthew",
    name: "Matthew Downing",
    email: "matthew.downing@thenest.com.au",
    seesAllFunds: true,
  },
  {
    id: "raphael",
    name: "Raphael Pitts",
    email: "raphael.pitts@thenest.com.au",
    seesAllFunds: false,
    fundOwners: ["Raphael Pitts", "Jack Woods"],
  },
  {
    id: "jack",
    name: "Jack Woods",
    email: "jack.woods@thenest.com.au",
    seesAllFunds: false,
    fundOwners: ["Jack Woods", "Raphael Pitts"],
  },
  {
    id: "timothy",
    name: "Timothy Easterbrook",
    email: "timothy.easterbrook@thenest.com.au",
    seesAllFunds: false,
    fundOwners: ["Timothy Easterbrook"],
  },
];

const DEFAULT_PW: Record<string, string> = {
  matthew: "downing2026",
  raphael: "pitts2026",
  jack: "woods2026",
  timothy: "easterbrook2026",
};

const ENV_PW: Record<string, string | undefined> = {
  matthew: import.meta.env.VITE_PW_MATTHEW,
  raphael: import.meta.env.VITE_PW_RAPHAEL,
  jack: import.meta.env.VITE_PW_JACK,
  timothy: import.meta.env.VITE_PW_TIMOTHY,
};

export function checkPassword(user: TeamUser, pw: string): boolean {
  return pw === (ENV_PW[user.id] || DEFAULT_PW[user.id]);
}

export function userById(id: string | null): TeamUser | null {
  return TEAM.find((u) => u.id === id) ?? null;
}

export function userByEmail(email: string | null | undefined): TeamUser | null {
  if (!email) return null;
  const e = email.toLowerCase();
  return TEAM.find((u) => u.email?.toLowerCase() === e) ?? null;
}

export function canSeeFund(user: TeamUser, firm: Firm): boolean {
  if (user.seesAllFunds) return true;
  const owners = new Set(user.fundOwners ?? [user.name]);
  if (firm.owner && owners.has(firm.owner)) return true;
  return (firm.owners ?? []).some((o) => owners.has(o));
}

export function visibleFunds(user: TeamUser, firms: Firm[]): Firm[] {
  return firms.filter(
    (f) => (f.status === "Live" || f.status === "Onboarded") && canSeeFund(user, f),
  );
}
