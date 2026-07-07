export type Status =
  | "Live"
  | "Onboarded"
  | "Active"
  | "Engaged"
  | "Prospecting"
  | "Not Now"
  | "Dead";

export interface Contact {
  name?: string;
  title?: string;
  email?: string;
  phone?: string;
  li?: string;
}

export interface FirmEvent {
  title?: string;
  date?: string;
  time?: string;
  notes?: string;
}

export type Plan = "" | "PPR" | "Enterprise";

export interface Firm {
  id: string;
  name: string;
  status: Status;
  plan?: Plan;
  owner?: string;
  owners?: string[];
  contact?: string;
  title?: string;
  email?: string;
  phone?: string;
  li?: string;
  contact2?: string;
  title2?: string;
  email2?: string;
  phone2?: string;
  li2?: string;
  website?: string;
  logo_domain?: string;
  fum?: string;
  fum_conf?: string;
  asset_classes?: string[];
  has_deal?: boolean;
  last_contact?: string;
  followup?: string;
  action?: string;
  note?: string;
  note_updated?: string;
  contacts?: Contact[];
  docs?: unknown[];
  events?: FirmEvent[];
  is_placement?: boolean;
  is_family_office?: boolean;
  tier?: string;
  activities?: string;
  // Master view (deal book) fields
  deal_amount?: string;
  deal_update?: string;
  deal_update_at?: string;
}

export const STATUSES: Status[] = [
  "Live",
  "Onboarded",
  "Active",
  "Engaged",
  "Prospecting",
  "Not Now",
  "Dead",
];

export const OWNERS = [
  "Raphael Pitts",
  "Jack Woods",
  "Matthew Downing",
  "Timothy Easterbrook",
];

export const ASSET_CLASSES = [
  "Australian Shares",
  "International Shares",
  "Property",
  "Mortgages",
  "Alternatives",
  "Multi-Asset",
  "Australian Fixed Interest",
  "International Fixed Interest",
  "Fixed Assets",
  "Retirement Products",
  "IM Products",
  "Cash",
];

// Status colours carried over from the original CRM
export const STATUS_STYLE: Record<Status, { fg: string; bg: string }> = {
  Live: { fg: "#6ec98a", bg: "#0a2414" },
  Onboarded: { fg: "#4db8a0", bg: "#062018" },
  Active: { fg: "#e89060", bg: "#301206" },
  Engaged: { fg: "#78b4d0", bg: "#0a1e2c" },
  Prospecting: { fg: "#b8b098", bg: "#201e18" },
  "Not Now": { fg: "#907870", bg: "#201614" },
  Dead: { fg: "#686058", bg: "#141210" },
};
