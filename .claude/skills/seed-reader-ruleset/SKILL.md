---
name: seed-reader-ruleset
description: Add a ruleset, a game mode or a new Multiplayer mod/Steamodded/Balatro version to the Seed reader (/seed-reader, src/lib/seed). Use when asked to support another ruleset (Vanilla, Smallworld, Major League…), The Order off, or a new patch of BalatroMultiplayerPvP / BalatroMultiplayerAPI / Steamodded.
---

# Adding a ruleset or patch to the Seed reader

The Seed reader ports Balatro's RNG and the mod's pool rules to TypeScript. A wrong pool
(one card too many or too few, or in the wrong order) silently shifts every roll after it, so the
work is mostly reading the mod's Lua carefully. Read `src/lib/seed/NOTES.md` first: it records how
the current rulesets were derived and what is still unconfirmed.

## Where things live

| File | What it holds |
|---|---|
| `src/lib/seed/pseudo.ts`, `lua-random.ts` | Balatro's pseudohash/pseudoseed/pseudorandom and LuaJIT's `math.random`. Only touch these if Balatro itself changes. |
| `scripts/import-seed-pools.ts` → `src/lib/seed/pools.generated.json` | Vanilla pools in RNG order, read from Balatro.exe (`npm run import-seed-pools`). |
| `src/lib/seed/rulesets.ts` | `PatchDef` (a mod version: its rulesets and game mode), `RulesetDef` (bans, added mod cards, stakes, sticker exceptions), `GameModeDef`, `STAKES`. Mostly data. |
| `src/lib/seed/reader.ts` | The queues. Stream names and The Order's logic live here. |
| `src/lib/seed/*.test.ts` | Tests, including checks against a real save. |
| `src/components/seed-reader/` | The page. `index.tsx` picks which cards' art is sent to the browser. |

## Sources to read

Clone (shallow is fine) into a scratch folder, never into the repo:

- `github.com/Balatro-Multiplayer/BalatroMultiplayerPvP`: rulesets, layers, game modes, cards.
- `github.com/Balatro-Multiplayer/BalatroMultiplayerAPI`: The Order (`api/the_order/`,
  `lovely/TheOrder.toml`), pool gating (`lovely/pool_gating.toml`, `api/layers/`), bans
  (`api/ruleset/bans.lua`), reworks (`api/ruleset/reworks.lua`).
- `github.com/Steamodded/smods` at the tag the mod's manifest asks for (`git checkout <tag>`):
  `lovely/pool.toml`, `rarity.toml`, `center.toml`, `shop.toml`, `sticker.toml`, `src/utils.lua`
  (`poll_rarity`, `poll_seal`, `create_card`), `src/overrides.lua` (`poll_edition`, `get_pack`).
- Vanilla Lua: unzip Balatro.exe (it is a zip with an exe in front). Lovely dumps of the patched
  files are in `%APPDATA%/Balatro/Mods/lovely/dump` when Lovely is installed, but they're from
  whatever mod versions are installed there, so check the versions.

## Adding a ruleset

1. **Resolve the ruleset's layers.** `rulesets/<name>.lua` lists `layers`; each is in
   `layers/<layer>.lua`. `MPAPI.resolve_layers` (`api/layers/fields.lua`) concatenates the array
   fields (`banned_*`, `banned_silent`, `included_*`, `reworked_*`) of every layer, and for
   scalars (`multiplayer_content`) the last layer wins. Check whether ranked forces The Order
   (`layers/ranked.lua`, the ruleset's `force_lobby_options`) and which stakes ranked allows
   (`allowed_stakes`, often in a draft layer).
2. **Collect the bans.** `banned_*` and `banned_silent` from all layers, plus the game mode's
   (`gamemodes/*.lua`; `MPAPI.ApplyBans` adds them). Bans stay in their pool as `UNAVAILABLE`.
   The game mode's bans go in the patch's `GameModeDef`, not the ruleset.
3. **Work out which mod cards are in the pools, and in what order.** For every mod object
   (`SMODS.Joker`, `MPAPI.Joker`, `SMODS.Consumable`, `SMODS.Tag`, `SMODS.Voucher`,
   `SMODS.Booster`, `SMODS.Enhancement`, `SMODS.Edition`), `MPAPI.should_exclude_from_pool`
   decides:
   - an explicit `mp_include` wins;
   - a key listed in any layer's `included_*`/`reworked_*` gets an automatic `mp_include` that
     is true when one of those layers is active;
   - otherwise the mod's isolation gate (`layers/_layers.lua`), which is the ruleset's
     `multiplayer_content`.

   Excluded cards are **removed** from the pool. Included cards are appended after the vanilla
   cards of their pool in registration order: the order `core.lua` calls `PVP.load_mp_dir`,
   files sorted by lowercase name (`_` files first). Skip commented-out files (`--[[`).
   `take_ownership` keeps the vanilla slot. An included card whose `in_pool` returns false is
   still a slot, just `UNAVAILABLE` (Ward Tag, Manhunt vouchers, Penny Pincher before the first
   PvP blind). Put those keys in `banned` too, and note why.
4. **Check reworks.** `ReworkCenter` entries for the ruleset's layers: a `rarity` change moves a
   joker between rarity pools (and re-sorts by `order`). Anything else only matters if it
   draws from a stream the reader shows. Grep the mod for `pseudoseed(`/`pseudorandom(` with
   those stream names (`rarity`, `Joker`, `cdt`, `shop_pack`, `Voucher`, `Tag`, `soul_`,
   `lucky`, `edi`, `_etper`, `_rent`, `front`, `Enhanced`, `illusion`, `std`, `cert`).
5. **Write the `RulesetDef`** in `rulesets.ts`, with a doc comment naming the files it came
   from. Fill in `added` (by pool, in order), `banned`, `noEternal`/`noPerishable` for added
   jokers (`eternal_compat`/`perishable_compat`, SMODS defaults both to true), `stakes`, and a
   flag like `pennyPincher` if a card's slot opens mid-game. Add it to the patch's `rulesets`
   (the first is the page's default). If the ruleset has a card type the reader doesn't know
   yet (new consumable sets, editions, seals), extend `buildPools` in `reader.ts`.
6. **Art.** `src/components/seed-reader/index.tsx` sends the art for every key in the pools and
   the rulesets' `added` lists. Check each added key exists in `src/data/game.generated.json`
   (`npm run import-game` imports the mod's cards).
7. **Tests** in `reader.test.ts`: pool lengths and the tail of each changed pool (as the
   Expanded tests do), that bans never come up, that added cards do.
8. **Write it down** in `src/lib/seed/NOTES.md`: what you derived and from where, and anything
   you couldn't confirm.

## Adding a patch (new mod version)

1. Diff the mod repos between the old and new tag/commit, focusing on `layers/`, `rulesets/`,
   `gamemodes/`, `objects/`, `core.lua` (load order), and in MultiplayerAPI `api/the_order/`,
   `lovely/TheOrder.toml`, `lovely/pool_gating.toml`, `api/layers/`.
2. Check the Steamodded version the manifest requires and diff its `lovely/` and the functions
   listed above. The Order's lovely patches match Steamodded's code by text: if Steamodded
   changed the line, the patch may no longer apply.
3. If only data changed, add a new `PatchDef` first in `PATCHES` (the newest is the default)
   with its own rulesets and game mode; keep the old one so old seeds still read right.
4. If the logic changed (stream names, sticker order, culling), make the changed behaviour a
   field on `PatchDef` that `reader.ts` branches on, so older patches keep working. Don't edit
   the shared logic in place.
5. If Balatro itself updated, rerun `npm run import-seed-pools` and check the diff of
   `pools.generated.json`. A changed order means older patches need the old pools kept.

## The Order off

`reader.ts` only implements The Order (the page's checkbox is locked on). Without it, stream
names carry the ante and the card's `key_append` (`Joker1sho1`, `rarity1sho`, `cdt1`,
`Tarotsho1`…), a roll on an unavailable card retries on `<key>_resample<n>` instead of the
same stream, stickers come from `etperpoll<ante>`/`ssjr<ante>` (or `packetper`/`packssjr`) after
the joker is picked, and there are no sticker queues. Each queue then restarts every ante, so
the page needs an ante picker. Add it as a setting on `ReaderSettings` and branch where the
stream names are built.

## Verify

- `npx tsc --noEmit -p . --incremental false`, `npx vitest run`,
  `./node_modules/.bin/biome check` on the changed files (the repo has older unrelated failures).
- Open `/seed-reader?seed=<seed>&ruleset=<id>` on the dev server and look at each tab.
- The strongest check is a real game: a save (`%APPDATA%/Balatro/<profile>/save.jkr` is raw
  deflate; its `G.GAME.pseudorandom` table has each stream's state and the seed) or a log with
  known shop contents. `pseudo.test.ts` shows how to test against a save.
