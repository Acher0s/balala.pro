---
name: bmp-replay-update
description: Keep "What did I block?" (/what-did-i-block, src/lib/seed/blocks.ts) and the Seed reader in line with a new BalatroMultiplayer (PvP / MultiplayerAPI / Steamodded) version, or make the replay follow real match logs more closely. Use when a new BMP version ships, when the replay's agreement drops on new matches, when a match log uses opcodes or decks the replay doesn't know, or when asked to improve the block finder.
---

# Keeping the match replay in line with BMP

"What did I block?" rebuilds every random roll of a match from the seed and the player's
actions in balatromp.com's match log, and checks itself against every card the log shows. It
sits on the Seed reader (`src/lib/seed/reader.ts`); for pool and ruleset changes, follow the
`seed-reader-ruleset` skill first. Read `src/lib/seed/NOTES.md` ("What did I block?") for what
is modelled and what isn't confirmed.

## The loop

Everything here is driven by one measure: how many of the cards the log shows were where the
replay put them.

1. **Get matches.** Shared links from the user (`https://balatromp.com/matches/<id>`). A log
   the player hasn't shared comes back cut down to its blinds (no `run_info`); the owner can
   save the full file while logged in (`/api/proxy/runs/<id>/replay`, the page explains it).
   Ask the user for more matches whenever the ones at hand don't cover what changed (a deck,
   a stake, a tag, a joker).
   To pull all of a player's own matches at once (both sides), they paste this into their
   browser's console on balatromp.com while logged in (Firefox asks them to type
   `allow pasting` first). It downloads `balatromp-my-matches.json`, which
   `check-replays.ts` reads as is. The site's login is a token in `localStorage.bmp_token`,
   sent as a Bearer header (its `apiFetch`); the script sends it only to balatromp.com, like
   the site does. Never ask for the token or cookies.

   ```js
   (async () => {
     const auth = { Authorization: `Bearer ${localStorage.getItem("bmp_token")}` };
     const api = (p) => fetch("/api/proxy" + p, { headers: auth })
       .then((r) => { if (!r.ok) throw new Error(`${p} ${r.status}`); return r.json(); });
     const ids = [];
     for (let page = 1; ; page++) {
       const { runs = [], total = 0 } = await api(`/runs/mine?page=${page}&pageSize=20`);
       ids.push(...runs.map((r) => r.id));
       console.log(`list ${ids.length}/${total}`);
       if (!runs.length || ids.length >= total) break;
     }
     const out = [];
     for (const [i, id] of ids.entries()) {
       try { out.push({ id, replay: await api(`/runs/${id}/replay`) }); }
       catch (e) { console.warn(id, e.message); }
       console.log(`replay ${i + 1}/${ids.length}`);
     }
     const a = document.createElement("a");
     a.href = URL.createObjectURL(new Blob([JSON.stringify(out)], { type: "application/json" }));
     a.download = "balatromp-my-matches.json";
     a.click();
   })();
   ```
2. **Measure.** `npx tsx scripts/check-replays.ts` (the fixtures), or with links, ids or
   saved files. It prints shop / packs / made / jokers agreement and the first miss.
3. **Trace.** `npx tsx scripts/check-replays.ts --trace <dir> <match>` writes every event
   (with the player's money), every shop and pack the replay rolled, every made card with
   what was held, every check (`ok` / `MISS`), every resync / realign. Read from the first
   `MISS` backwards to the last `ok` of the same queue: whatever happened in between drew a
   card the replay didn't, or the other way round.
4. **Find the draw.** The streams are independent (`TarotTarot0`, `Joker10`, `cdt0`,
   `rarity0`, `_etperJoker20`, …), so a miss on one queue is caused by that queue only. Ask:
   what in between could take from it? Candidates are in the table below; the Lua is the
   authority (see "Sources").
5. **Let the probe find the spot.** `npx tsx scripts/probe-replays.ts <source> --family Tarot`
   (or `Planet`, `Spectral`, `joker`; `--from-start` for queues checked rarely) reruns each
   log with one or two extra draws on the queue's stream before every event since the last
   good check, and prints the spots that fix the most checks. A clear winner names the event;
   a long run of equal spots means the missing draw is anywhere in there, so look at what
   those events have in common. If a single extra draw helps nowhere, the replay is drawing
   the right number but skipping differently (owned / on screen / locked): look at what's
   held. This found the used Emperor skipping its own key.

   Many logs at once: write a small script (scratch folder) that runs `findBlocks` over every
   log of a pulled file, groups the first misses by queue, and prints the jokers and cards
   seen between the last good check and the miss. What recurs across logs is the lead.
6. **Test a hypothesis cheaply.** Put a temporary switch in `blocks.ts`
   (`if (process.env.X) …`), rerun the one match with and without it, and keep the variant
   that turns misses into `ok` everywhere after. Remove the switch before committing. (This is
   how the Rare Tag filling both opening slots was found: one switch took a match from 10/48
   shop to 48/48.)
7. **Lock it in.** Add the match as a fixture
   (`npx tsx scripts/make-replay-fixture.ts <match> src/lib/seed/fixtures/<seed>-log.json "" "<what it covers>"`,
   then check the file has no names: compare against every `displayName` in the pulled file,
   ignoring numeric names and short names that only match inside game words) and a case in `blocks.test.ts`: either "replays without
   a miss" or a floor on its agreement. Write what you learned in NOTES.md, and update this
   skill if the process changed.

## The log

Recorded by MultiplayerAPI `api/replay/` (`opcodes.lua`, `generic_codes.lua`, `codes.lua`,
`area_utils.lua`). Events are `[ms, opcode, args]`. What the replay reads:

| opcode | args | used for |
|---|---|---|
| `lobby_info`, `run_info` | ruleset, game mode, The Order, mod version; deck (key or name), seed, stake (mod stakes after Gold: 9 Planet, 10 Spectral, 11 Spectral+) | `matchSettings` |
| `select_blind` / `skip_blind` | blind key / — | ante, setting_blind creators, skip tags |
| `cashout`, `reroll`, `leave_shop` | — | shop rolls |
| `buy` | area, slot, card ref, cost, bought-and-used | shop checks |
| `open_pack`, `pack_pick`, `pack_skip` | pack ref; picked ref and targets; refs shown | pack rolls and checks |
| `use` | slot, positions, card ref, target refs | consumables, vouchers (redeemed via `use`) |
| `sell` | area (4 jokers, 5 consumables), slot, ref | held cards |
| `reorder` | area, …, moves | first sightings of made cards |
| `discard`, `play` | positions, card refs (+ joker tokens `key\|edition` on `play`) | Purple Seals, hand shapes, joker snapshot |
| `money_delta` | the amount (every `ease_dollars`) | money, for Vagabond |
| `joker_hit` (1.0.6) | source (`wraith`, `judgement`, `soul`, `riffraff`, `ankh`, `invisible`), created joker tokens, destroyed | checks the jokers made for it right away |

Logs before 1.0.5 differ (no blind key, no joker tokens on `play`, packs opened via `use`) and
are refused by `matchSettings`; a new version gets its own `PatchDef` and is only read once
it's measured.

A ref's first sighting has a negative id and says what it is (`[-id,"pc",suit,rank,"e:…","ed:…","s:…"]`
or `[-id,set,key]`); later ones are `[id, mods…]`. The log has **no shop contents and no card
creation**: everything made is rolled again here. New opcodes or a new `schema_version`: read
`opcodes.lua` and the code's `write` call, then decide whether the replay needs it.

## What takes from the queues (and the replay models)

Card creation under The Order (MultiplayerAPI `api/the_order/card_creation.lua`): ante 0;
Tarot/Planet/Spectral outside packs use `<Set><Set>0`, in packs `<Set><Set>_pack0`; jokers drop
their key_append (`Joker<r>0`, rarity on `rarity0`); shop and pack jokers roll stickers first
(`lovely/TheOrder.toml`, "stable shop").

| maker | when (vanilla `card.lua` unless said) | room check | queue |
|---|---|---|---|
| Shop slot | each slot at cashout / reroll / Overstock | — | `cdt0`, then by type |
| Uncommon / Rare Tag | the next shop's opening slots (all of them, seen in a log) | — | `Joker2/3 0` with stickers |
| Buffoon / Arcana / Celestial / Spectral Pack | open_pack, one per card | — | as the shop / `_pack0` + `soul_<set>0` |
| Riff-raff | setting_blind, copies included | jokers | `Joker10` stickerless |
| Judgement / Wraith / The Soul | use | jokers | `Joker<r>0` (`order_jud_rarity` from Black Stake) |
| Top-up Tag | skip | jokers | `Joker10` |
| Cartomancer | setting_blind, copies | consumables | `TarotTarot0` |
| Vagabond | joker_main, money ≤ $4 before the hand, copies | consumables | `TarotTarot0` |
| Superposition | joker_main, Ace + Straight, copies | consumables | `TarotTarot0` |
| Séance | joker_main, Straight Flush, copies | consumables | `SpectralSpectral0` |
| Sixth Sense | destroying_card, first hand a single 6, not copied | consumables | `SpectralSpectral0` |
| Hallucination | open_booster, `halu0` < odds/2 | consumables | `TarotTarot0` |
| Purple Seal | each discarded card | consumables | `TarotTarot0` |
| 8 Ball | individual: each scoring 8, again per retrigger (Red Seal, Seltzer, the mod's Hanging Chad on scoring cards 1–2), copies; `8ball` < odds/4 | consumables | `TarotTarot0` |
| The Emperor / High Priestess | use: min(2, free slots); the used card is out of its slot but still exists, so its key is skipped | consumables | Tarot / Planet |
| The Fool, Blue Seal (last hand's planet), starting decks | by key, no roll (a banned key, e.g. culled in Small World, draws from the pool instead) | consumables | — (banned: `PlanetPlanet0`) |

**Known bugs the replay works around** (check each new version and drop the workaround once
fixed): in Multiplayer 1.0.5, a player who looks at the lobby info (any time) gets both
players' avatar jokers stuck in `G.GAME.used_jokers`, so their own shop and packs skip both
from then on (fixed in 1.0.6, MPAPI 34ceb7e). Nothing in the log says so; `findBlocksAuto` guesses it from misses nothing else
explains, trying only the jokers the avatar picker offers (`AVATARS` in `blocks.ts`: update it
when the site's avatar list changes), and `findBlocksMatch` shares the pair between the two logs of a match (`AVATAR_BUG`
lists the versions). When a new kind of inexplicable miss shows up, ask the user: they may know a bug.

Room is `#held + made-this-event < limit` (2, +1 Crystal Ball, +negatives, deck changes).
Blueprint copies the joker to its right, Brainstorm the first; the joker order comes from the
next `play` snapshot. Hands go through `evaluateHand` (name and scoring cards). Not modelled
yet (each would show as misses on its queue): Dusk's 8 Ball retrigger, Perkeo, phantom copies of
the opponent's Let's Go Gambling / Pizza / Conjoined / Speedrun (MPAPI `api/synced/phantom.lua`;
needs the other side's log, which a pulled file has), Certificate / Marble / DNA (playing cards only, no effect on these
queues), tags other than Top-up / Uncommon / Rare, the Voucher Tag, Omen Globe, Glass breaking,
Cocktail Deck's mixed effects, Gradient Deck.

## Updating for a new BMP version

1. **Versions.** `lobby_info.options` has `mod_version`, `smods_version`, `mod_hash` (the mod
   list). Compare with the `PatchDef`s in `rulesets.ts`.
2. **Sources.** Clone into a scratch folder at the new tags: BalatroMultiplayerPvP,
   BalatroMultiplayerAPI, Steamodded (the manifest's version). Vanilla + patches: the Lovely
   dump in `%APPDATA%/Balatro/Mods/lovely/dump` (check which mod versions produced it).
3. **Diff what the replay depends on:**
   - MPAPI `api/the_order/` (`card_creation.lua`, `tags.lua`, `seed_keys.lua`) and
     `lovely/TheOrder.toml`: stream names, sticker order, what `ante_based()` returns.
   - MPAPI `api/replay/`: opcodes and their args.
   - PvP `objects/decks/` (starting vouchers/consumables → `DECK_START` in `blocks.ts`),
     `objects/jokers/` and `objects/consumables/` (grep `create_card`, `SMODS.add_card`,
     `pseudorandom`), `layers/` and `rulesets/` (bans, reworks, pool gates like Penny
     Pincher's `pincher_unlock`).
   - Steamodded `src/utils.lua` (`pseudorandom_probability`, `poll_rarity`), `lovely/tag.toml`.
4. **Change behind a patch.** Data changes go in a new `PatchDef`. Logic that changes between
   versions becomes a field the code branches on; old matches must keep replaying the same.
   `matchSettings` picks the patch whose id is `pvp-<mod_version>` and refuses any other.
   Tests built on a real match take that match's patch by id (`PATCHES.find(...)`), never
   `PATCHES[0]`, which moves to the new version. Anything cached per ruleset is keyed by the
   ruleset object: the ids (`expanded`, `smallworld`) repeat across patches.
5. **Measure** every fixture and a few new matches on the new version; nothing that was
   `ok` should turn into a `MISS`.

## Files

| File | What |
|---|---|
| `src/lib/seed/blocks.ts` | The replay: `matchSettings`, `findBlocks` (its `trace`, `probe` and `avatars` arguments), `findBlocksAuto` / `findBlocksMatch` (lobby avatars), `evaluateHand`, the makers, `DECK_START` |
| `src/lib/seed/reader.ts` | `ShopSim` (`next`, `consumable`, `packConsumable`, `buffoonCard`, `otherJoker`, `tagJoker`, `fork`, `skip`, `chance`), `Game`, pools |
| `replaySteps` (blocks.ts), `ShopSim.lateStart`, `ReaderStart`, `src/components/seed-reader/walkthrough.tsx` | The seed reader's late start and log walkthrough: a new stream the replay rolls is carried over automatically; one it doesn't roll (like `shop_pack0`) needs its own offset in `ReaderStart` |
| `src/lib/seed/replay-file.ts` | Reading balatromp.com's replay JSON (server and browser) |
| `src/app/api/what-did-i-block/[id]/route.ts` | Fetches a shared match |
| `src/components/block-check/` | The page, including opening a saved file |
| `scripts/check-replays.ts`, `scripts/probe-replays.ts`, `scripts/make-replay-fixture.ts` | The loop above |
| `src/lib/seed/fixtures/*-log.json`, `blocks.test.ts` | Real matches and their expectations |

## Rules

- No player names, lobby codes or account ids in the repo: fixtures go through
  `make-replay-fixture.ts`, tests use seeds only.
- Commit locally; push only when the user says so.
- `npx tsc --noEmit -p . --incremental false`, `npx vitest run`, `./node_modules/.bin/biome check`
  on changed files before committing.
