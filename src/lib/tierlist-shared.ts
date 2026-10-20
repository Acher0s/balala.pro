/** Tier list types and defaults shared by the maker (browser) and the server. */

export interface Tier {
  id: string;
  label: string;
  color: string;
  /** Item refs, e.g. "joker:mime", "joker:mp_pizza", "card:H_K". */
  items: string[];
}

export interface TierListData {
  tiers: Tier[];
  /** Cards loaded into the list but not ranked yet. Not shown on the published list. */
  pool: string[];
}

/** One card the maker can rank. `layers` are stacked images (playing cards are base + front). */
export interface TierItem {
  ref: string;
  name: string;
  /** Preset group, e.g. "joker", "multiplayer", "tarot", "card". */
  group: string;
  /** Short note shown under mod cards, e.g. "Multiplayer". */
  source: string | null;
  layers: string[];
}

export const LIMITS = {
  title: 80,
  description: 300,
  tiers: 20,
  label: 40,
  items: 600,
  listsPerUser: 100,
};

/** TierMaker's colours. */
export const TIER_COLORS = [
  "#ff7f7f",
  "#ffbf7f",
  "#ffdf7f",
  "#ffff7f",
  "#bfff7f",
  "#7fff7f",
  "#7fffff",
  "#7fbfff",
  "#7f7fff",
  "#ff7fff",
  "#bf7fbf",
  "#3b3b3b",
  "#858585",
  "#cfcfcf",
  "#f7f7f7",
];

export function newTierId() {
  return Math.random().toString(36).slice(2, 10);
}

export function defaultTiers(): Tier[] {
  return ["S", "A", "B", "C", "D"].map((label, i) => ({
    id: newTierId(),
    label,
    color: TIER_COLORS[i],
    items: [],
  }));
}

export interface Preset {
  id: string;
  label: string;
  /** Which item groups the preset loads. */
  groups: string[];
}

export const PRESETS: Preset[] = [
  { id: "jokers", label: "All jokers", groups: ["joker"] },
  { id: "mp-jokers", label: "Multiplayer jokers", groups: ["multiplayer"] },
  { id: "tarots", label: "All tarots", groups: ["tarot"] },
  { id: "planets", label: "All planets", groups: ["planet"] },
  { id: "spectrals", label: "All spectrals", groups: ["spectral"] },
  { id: "vouchers", label: "All vouchers", groups: ["voucher"] },
  { id: "enhancements", label: "All enhancements", groups: ["enhancement"] },
  { id: "seals", label: "All seals", groups: ["seal"] },
  { id: "decks", label: "All decks", groups: ["deck"] },
  { id: "cards", label: "Playing cards", groups: ["card"] },
  { id: "empty", label: "Empty (add your own)", groups: [] },
];

export function allRefs(data: TierListData): string[] {
  return [...data.tiers.flatMap((t) => t.items), ...data.pool];
}
