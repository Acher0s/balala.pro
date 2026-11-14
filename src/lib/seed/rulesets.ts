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
  /** Mod cards in this ruleset's pools, by pool, appended after the vanilla cards. */
  added: {
    jokers?: Partial<Record<1 | 2 | 3 | 4, string[]>>;
    Planet?: string[];
    Spectral?: string[];
    /** In pool order; an upgrade lists the voucher it requires. */
    vouchers?: { key: string; requires: string[] }[];
    tags?: string[];
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
  /** Whether ranked matches on this ruleset always use The Order. */
  rankedOrder: boolean;
}

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
  },
  noEternal: ["j_mp_pizza", "j_mp_seltzer", "j_mp_turtle_bean"],
  noPerishable: ["j_mp_taxes"],
  pennyPincher: true,
  stakes: [1, 3, 4, 6, 8, 9],
  rankedOrder: true,
};

const BALANCED: RulesetDef = {
  id: "balanced",
  name: "Balanced",
  banned: ["j_hanging_chad", "j_bloodstone", "c_justice"],
  added: { jokers: { 1: ["j_mp_hanging_chad"], 2: ["j_mp_bloodstone"] } },
  stakes: [1, 2, 3, 4, 5, 6, 7, 8],
  rankedOrder: true,
};

/** Mod versions the reader knows. The first is the current one. */
export const PATCHES: PatchDef[] = [
  {
    id: "pvp-1.0.5",
    label: "Multiplayer PvP 1.0.5",
    rulesets: [EXPANDED, BALANCED],
    gameMode: ATTRITION,
  },
];

export function findPatch(id: string): PatchDef {
  return PATCHES.find((p) => p.id === id) ?? PATCHES[0];
}

export function findRuleset(patch: PatchDef, id: string): RulesetDef {
  return patch.rulesets.find((r) => r.id === id) ?? patch.rulesets[0];
}
