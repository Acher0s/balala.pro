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
  /** Vanilla keys this ruleset bans: they stay in their pool as UNAVAILABLE. */
  banned: string[];
  /** Mod cards in this ruleset's pools, by pool, appended after the vanilla cards. */
  added: {
    jokers?: Partial<Record<1 | 2 | 3 | 4, string[]>>;
  };
  /** Whether ranked matches on this ruleset always use The Order. */
  rankedOrder: boolean;
}

export interface PatchDef {
  id: string;
  /** Shown in the page's picker. */
  label: string;
  rulesets: RulesetDef[];
}

/**
 * Balanced (rulesets/balanced.lua → layers/balanced.lua): Hanging Chad and Bloodstone are
 * swapped for the mod's versions, Justice is banned, and none of the mod's own new jokers
 * (multiplayer_content = false) are in the pools. Ranked forces The Order on (layers/ranked.lua).
 */
const BALANCED: RulesetDef = {
  id: "balanced",
  name: "Balanced",
  banned: ["j_hanging_chad", "j_bloodstone", "c_justice"],
  added: { jokers: { 1: ["j_mp_hanging_chad"], 2: ["j_mp_bloodstone"] } },
  rankedOrder: true,
};

/** Mod versions the reader knows. The first is the current one. */
export const PATCHES: PatchDef[] = [
  {
    id: "pvp-1.0.5",
    label: "Multiplayer PvP 1.0.5",
    rulesets: [BALANCED],
  },
];

export function findPatch(id: string): PatchDef {
  return PATCHES.find((p) => p.id === id) ?? PATCHES[0];
}

export function findRuleset(patch: PatchDef, id: string): RulesetDef {
  return patch.rulesets.find((r) => r.id === id) ?? patch.rulesets[0];
}
