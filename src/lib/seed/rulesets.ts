/**
 * What a ruleset and a mod version change about the pools a seed rolls from. The vanilla pools
 * come from the game (pools.generated.json); a ruleset bans some of their entries and adds
 * its own cards after them.
 *
 * In the mod (BalatroMultiplayerAPI, lovely/pool_gating.toml) a banned card keeps its place in
 * the pool as UNAVAILABLE, so a roll that lands on it moves on to the next one, while a mod card
 * the ruleset doesn't use is left out of the pool altogether. Only the cards the ruleset turns on
 * are added, after the vanilla ones, in the order the mod registers them.
 */

export interface RulesetDef {
  id: string;
  name: string;
  /**
   * Keys that stay in their pool as UNAVAILABLE: the ruleset's bans, and mod cards it keeps in
   * the pool whose in_pool says no (they hold a slot, but are never picked).
   */
  banned: string[];
  /**
   * Keys in `banned` that the game doesn't ban: they're in the pool, but their in_pool says no.
   * Small World counts them when it culls (it reads G.GAME.banned_keys, not in_pool).
   */
  closed?: string[];
  /** Mod cards in this ruleset's pools, by pool, appended after the vanilla cards. */
  added: {
    jokers?: Partial<Record<1 | 2 | 3 | 4, string[]>>;
    Planet?: string[];
    Spectral?: string[];
    /** In pool order; an upgrade lists the voucher it requires. */
    vouchers?: { key: string; requires: string[] }[];
    tags?: string[];
    /** Packs in the Booster pool that the shop never rolls (weight 0); Small World counts them. */
    boosters?: string[];
  };
  /** Added jokers that can't be Eternal / Perishable (eternal_compat / perishable_compat). */
  noEternal?: string[];
  noPerishable?: string[];
  /**
   * Penny Pincher: in the pool only once PVP.GAME.pincher_unlock is set, at the first PvP
   * blind (objects/jokers/penny_pincher.lua); until then it's an UNAVAILABLE slot.
   */
  pennyPincher?: boolean;
  /** Stakes ranked plays on (ids from STAKES), when not all the vanilla ones. */
  stakes?: number[];
  /** Decks that change a queue and that this ruleset allows (ids from DECKS). */
  decks: DeckId[];
  /** Whether ranked matches on this ruleset always use The Order. */
  rankedOrder: boolean;
  /**
   * Small World (layers/smallworld.lua): 75% of every pool is banned at the start of the run,
   * picked by a seeded shuffle, and duplicates are allowed (SMODS.showman is always true).
   */
  smallWorld?: boolean;
}

/** Decks that change what a seed rolls. Any other deck reads the same as Red Deck. */
export type DeckId = "violet" | "orange" | "ghost";
export const DECKS: {
  id: DeckId;
  name: string;
  key: string;
  effect: string;
}[] = [
  {
    id: "violet",
    name: "Violet Deck",
    key: "b_mp_violet",
    effect: "two vouchers in every shop",
  },
  {
    id: "orange",
    name: "Orange Deck",
    key: "b_mp_orange",
    effect: "opens a Giga Standard Pack first",
  },
  {
    id: "ghost",
    name: "Ghost Deck",
    key: "b_ghost",
    effect: "Spectral cards in the shop",
  },
];

/**
 * Stakes the reader knows, by the number it uses. Spectral+ is the mod's own (objects/stakes):
 * it carries Eternals, Perishables and Rentals like Gold.
 */
export const STAKES: { id: number; name: string }[] = [
  { id: 1, name: "White" },
  { id: 2, name: "Red" },
  { id: 3, name: "Green" },
  { id: 4, name: "Black" },
  { id: 5, name: "Blue" },
  { id: 6, name: "Purple" },
  { id: 7, name: "Orange" },
  { id: 8, name: "Gold" },
  { id: 9, name: "Spectral+" },
];

/**
 * A game mode's bans (gamemodes/*.lua). MPAPI.ApplyBans adds them to the ruleset's, so they
 * apply whatever the ruleset, and they also stay in their pools as UNAVAILABLE.
 */
export interface GameModeDef {
  id: string;
  name: string;
  banned: string[];
}

export interface PatchDef {
  id: string;
  /** Shown in the page's picker. */
  label: string;
  rulesets: RulesetDef[];
  /** The game mode matches are played in. */
  gameMode: GameModeDef;
}

/**
 * Attrition (gamemodes/attrition.lua), the only PvP game mode: no jokers that save you from a
 * lost blind or touch the boss (Mr. Bones, Luchador, Matador, Chicot), no ante-changing
 * vouchers, no Boss Tag.
 */
const ATTRITION: GameModeDef = {
  id: "attrition",
  name: "Attrition",
  banned: [
    "j_mr_bones",
    "j_luchador",
    "j_matador",
    "j_chicot",
    "v_hieroglyph",
    "v_petroglyph",
    "v_directors_cut",
    "v_retcon",
    "tag_boss",
  ],
};

/**
 * Balanced (rulesets/balanced.lua → layers/balanced.lua): Hanging Chad and Bloodstone are
 * swapped for the mod's versions, Justice is banned, and none of the mod's own new jokers
 * (multiplayer_content = false) are in the pools. Ranked forces The Order on (layers/ranked.lua).
 */
/**
 * Expanded (rulesets/expanded.lua): the Balanced, Expanded and Expanded Draft layers. On top of
 * Balanced it bans Ticket, Seltzer, Turtle Bean and Ouija for the mod's versions, and turns the
 * mod's own content on (multiplayer_content = true), so every PvP card no other layer owns is in
 * the pools, after the vanilla cards, in the order the mod loads them (core.lua: objects/jokers,
 * then jokers/standard, and so on; files by name). Speedrun, Conjoined Joker and Defensive Joker
 * are banned but keep their slots; Penny Pincher's slot opens at the first PvP blind; the
 * Manhunt vouchers and the Ward Tag are in the pools but their in_pool is false, so they're
 * slots that are never picked. The stakes are Expanded Draft's.
 */
const EXPANDED: RulesetDef = {
  id: "expanded",
  name: "Expanded",
  banned: [
    "j_hanging_chad",
    "j_bloodstone",
    "c_justice",
    "j_ticket",
    "j_selzer",
    "j_turtle_bean",
    "c_ouija",
    "j_mp_speedrun",
    "j_mp_conjoined_joker",
    "j_mp_defensive_joker",
    "v_mp_hieroglyph_manhunt",
    "v_mp_petroglyph_manhunt",
    "tag_mp_ward",
  ],
  closed: ["v_mp_hieroglyph_manhunt", "v_mp_petroglyph_manhunt", "tag_mp_ward"],
  added: {
    jokers: {
      1: [
        "j_mp_defensive_joker",
        "j_mp_pacifist",
        "j_mp_penny_pincher",
        "j_mp_pizza",
        "j_mp_taxes",
        "j_mp_hanging_chad",
      ],
      2: [
        "j_mp_conjoined_joker",
        "j_mp_lets_go_gambling",
        "j_mp_skip_off",
        "j_mp_speedrun",
        "j_mp_bloodstone",
        "j_mp_seltzer",
        "j_mp_ticket",
        "j_mp_turtle_bean",
      ],
    },
    Planet: ["c_mp_asteroid"],
    Spectral: ["c_mp_ouija_standard"],
    vouchers: [
      { key: "v_mp_hieroglyph_manhunt", requires: [] },
      { key: "v_mp_petroglyph_manhunt", requires: ["v_mp_hieroglyph_manhunt"] },
    ],
    tags: ["tag_mp_ward"],
    // objects/boosters/standard_giga.lua: Orange Deck's pack, weight 0.
    boosters: ["p_mp_standard_giga"],
  },
  noEternal: ["j_mp_pizza", "j_mp_seltzer", "j_mp_turtle_bean"],
  noPerishable: ["j_mp_taxes"],
  pennyPincher: true,
  stakes: [1, 3, 4, 6, 8, 9],
  // layers/expanded.lua allowed_backs; Ghost Deck isn't in ranked, but it's there to read.
  decks: ["violet", "orange", "ghost"],
  rankedOrder: true,
};

/**
 * Small World (rulesets/smallworld.lua): Expanded's layers (balanced, expanded, expanded_draft)
 * plus the smallworld layer. Once the run has started (MPAPI.ApplyBans, after start_run) it
 * sorts every pool by key, shuffles it with pseudoshuffle on "<pool>_mp_smallworld" and bans the
 * first 75% (rounded); see smallWorldBans in reader.ts. Not a ranked ruleset, so The Order is the
 * lobby's choice.
 */
const SMALL_WORLD: RulesetDef = {
  ...EXPANDED,
  id: "smallworld",
  name: "Small World",
  rankedOrder: false,
  smallWorld: true,
};

const BALANCED: RulesetDef = {
  id: "balanced",
  name: "Balanced",
  banned: ["j_hanging_chad", "j_bloodstone", "c_justice"],
  added: { jokers: { 1: ["j_mp_hanging_chad"], 2: ["j_mp_bloodstone"] } },
  stakes: [1, 2, 3, 4, 5, 6, 7, 8],
  // rulesets/balanced.lua bans the Orange and Violet Decks.
  decks: ["ghost"],
  rankedOrder: true,
};

/**
 * 1.0.6 (BalatroMultiplayerPvP v1.0.5..v1.0.6): the Balanced layer, which every ruleset here
 * builds on, swaps Reserved Parking for the mod's (objects/jokers/standard/reserved_parking.lua,
 * a Common: a miss still counts as a trigger; it rolls its own "parking" stream), loaded after
 * Hanging Chad. And the mod's own content is now a layer of its own (layers/
 * multiplayer_content.lua) instead of a catch-all gate, which is now always off
 * (layers/_layers.lua): it lists the same jokers, Asteroid and the Manhunt vouchers, but not
 * the Ward Tag or the Giga Standard Pack, so those are out of the pools and out of Small
 * World's cull (its lists skip whatever MPAPI.should_exclude_from_pool drops). The Giga pack
 * still comes from Orange Deck by key. Small World's Tag:init now keeps a culled blind tag's
 * replacement, so skipping it gives the tag that was shown.
 */
const RESERVED_PARKING = {
  banned: ["j_reserved_parking"],
  common: "j_mp_reserved_parking",
};

const EXPANDED_106: RulesetDef = {
  ...EXPANDED,
  banned: [
    ...EXPANDED.banned.filter((k) => k !== "tag_mp_ward"),
    ...RESERVED_PARKING.banned,
  ],
  closed: ["v_mp_hieroglyph_manhunt", "v_mp_petroglyph_manhunt"],
  added: {
    ...EXPANDED.added,
    jokers: {
      ...EXPANDED.added.jokers,
      1: [...(EXPANDED.added.jokers?.[1] ?? []), RESERVED_PARKING.common],
    },
    tags: [],
    boosters: [],
  },
};

const SMALL_WORLD_106: RulesetDef = {
  ...EXPANDED_106,
  id: "smallworld",
  name: "Small World",
  rankedOrder: false,
  smallWorld: true,
};

const BALANCED_106: RulesetDef = {
  ...BALANCED,
  banned: [...BALANCED.banned, ...RESERVED_PARKING.banned],
  added: {
    ...BALANCED.added,
    jokers: {
      ...BALANCED.added.jokers,
      1: [...(BALANCED.added.jokers?.[1] ?? []), RESERVED_PARKING.common],
    },
  },
};

/** Mod versions the reader knows. The first is the current one. */
export const PATCHES: PatchDef[] = [
  {
    id: "pvp-1.0.6",
    label: "Multiplayer PvP 1.0.6",
    rulesets: [EXPANDED_106, SMALL_WORLD_106, BALANCED_106],
    gameMode: ATTRITION,
  },
  {
    id: "pvp-1.0.5",
    label: "Multiplayer PvP 1.0.5",
    rulesets: [EXPANDED, SMALL_WORLD, BALANCED],
    gameMode: ATTRITION,
  },
];

export function findPatch(id: string): PatchDef {
  return PATCHES.find((p) => p.id === id) ?? PATCHES[0];
}

export function findRuleset(patch: PatchDef, id: string): RulesetDef {
  return patch.rulesets.find((r) => r.id === id) ?? patch.rulesets[0];
}
