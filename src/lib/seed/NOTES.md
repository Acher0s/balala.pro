# Seed reader: how it's built and what isn't confirmed

The reader ports Balatro's RNG (`functions/misc_functions.lua`: pseudohash, pseudoseed,
pseudorandom, pseudorandom_element) and LuaJIT's `math.random` (TW223) to TypeScript, then
applies what Steamodded 26.1002.0, MultiplayerAPI (The Order: `api/the_order/`,
`lovely/TheOrder.toml`, `lovely/pool_gating.toml`) and MultiplayerPvP 1.0.5 (the Balanced
ruleset) change.

## Confirmed against the game

`pseudo.test.ts` checks the port against a real save (seed 94VJ9P47, no Order): the hashed
seed, four streams' saved states, the ante-1 voucher, both blind tags (with the exact resample
streams the save used), the first shop's two cards and its second pack. `lua-random.test.ts`
checks the 32-bit generator against a BigInt port of LuaJIT's C code.

## Read from the mod's code, not checked against an Order game

No save or log with The Order on and known shop contents was at hand, so the Order-specific
keys and logic come from reading the code:

- The seed gets a leading `*` (TheOrder.toml), so `ABC` is hashed as `*ABC`.
- Card creation runs with the ante set to 0. Consumables use `key_append` = their set
  (`TarotTarot0`) in the shop, or `<set>_pack` (`TarotTarot_pack0`) in packs. Jokers drop their
  key_append, so every joker rolls rarity on `rarity0` and draws from `Joker<r>0`; legendaries
  from `Joker4`.
- A shop or pack joker rolls `_etperJoker<r>0` (and `_rentJoker<r>0` on Gold Stake) first, and
  takes it from `Joker<r>0_sticker` if it got a sticker. Its edition is `ediJoker<r>0[_sticker]`,
  which moves on even when the pick is unavailable.
- Judgement on Black Stake and up rolls its rarity from `order_jud_rarity`.
- Vouchers use the culled pair pool and `Voucher0`; skip tags are unchanged (`Tag<ante>`).
- Packs are `shop_pack0`; shop types are `cdt0`.
- Base and Enhanced cards keep `key_append = 'sho'` (`frontsho0`, `Enhancedsho0`).

## Bans and reworks

- Bans come from the ruleset and the game mode (MPAPI.ApplyBans). Attrition, the only PvP game
  mode, bans Mr. Bones, Luchador, Matador, Chicot, Hieroglyph, Petroglyph, Director's Cut,
  Retcon and the Boss Tag. Balanced adds Hanging Chad, Bloodstone and Justice. A banned card
  keeps its slot in its pool as UNAVAILABLE: a roll that lands on it takes the next entry of
  the same queue (for jokers, the sticker roll is redone and the edition queue moves on too).
  Banned voucher pairs become one UNAVAILABLE slot that's rolled past; the Boss Tag's slot
  retries on its "Tag<ante>_resample<n>" stream.
- Reworks live in Balanced: Glass (numbers only), the mod's Hanging Chad (no RNG) and
  Bloodstone (its own "bloodstone" streams), and The Order's Uncommon/Rare Tags (still a forced
  rarity from the stickerless queue). None of them draws from a stream the reader shows. The
  Wraith and Ouija reworks belong to other layers, not Balanced.
- Consumables made outside packs share the shop queues under The Order (their key_append
  becomes the set): The Emperor, Purple Seals, Cartomancer and Hallucination take Tarots from
  "TarotTarot0"; The High Priestess and Blue Seals take Planets from "PlanetPlanet0"; Sixth
  Sense and Séance take Spectrals from "SpectralSpectral0".

## Expanded

Expanded (`rulesets/expanded.lua`) is the Balanced, Expanded and Expanded Draft layers, with
`multiplayer_content = true`, so every PvP card that no layer owns is in the pools (the mod's
isolation gate in `layers/_layers.lua`). Mod cards go after the vanilla ones in the order
Steamodded injects them: the order they register, which is the order `core.lua` loads the
folders (`objects/jokers`, then `jokers/sandbox`, `jokers/standard`, …) with files sorted by
name. Cards a ruleset can't use (sandbox, experimental, traps, Wraith rework) are removed.

- Common: Defensive Joker (banned), Pacifist, Penny Pincher, Pizza, Taxes, Hanging Chad.
- Uncommon: Conjoined Joker (banned), Let's Go Gambling, Skip-Off, Speedrun (banned),
  Bloodstone, Seltzer, Ticket, Turtle Bean.
- Planet: Asteroid. Spectral: the mod's Ouija (vanilla Ouija is banned).
- Banned vanilla: Ticket, Seltzer, Turtle Bean, Ouija, plus Balanced's and Attrition's.
- Penny Pincher's `in_pool` is `PVP.GAME.pincher_unlock`, set at the first PvP blind, so its
  slot is skipped until then. The page lets you say when that happened.
- The Manhunt vouchers and the Ward Tag are in the pools but their `in_pool` is false: they're
  slots that are never picked. The vouchers make the folded voucher list 17 slots instead of 16,
  and the Ward makes the tag pool 25, so Expanded's voucher and tag rolls differ from Balanced's.
- Stakes are Expanded Draft's: White, Green, Black, Purple, Gold and the mod's Spectral+, which
  has Eternals, Perishables and Rentals like Gold.
- Pizza, Seltzer and Turtle Bean can't be Eternal; Taxes can't be Perishable.

## Small World

Small World (`rulesets/smallworld.lua`) is Expanded's layers plus `layers/smallworld.lua`, so its
pools, bans and stakes start as Expanded's. On `apply_bans` (`MPAPI.ApplyBans`, which runs after
`start_run`) the layer culls:

- It builds one list per pool from `G.P_CENTERS` and `G.P_TAGS`: each joker rarity (`Joker1` to
  `Joker4`), Tarot, Planet, Spectral, Voucher, Booster and Tag. It leaves out cards already in
  `G.GAME.banned_keys`, cards with `requires` (upgrade vouchers) or `hidden` (The Soul, Black
  Hole), Cavendish, and mod cards the ruleset excludes. Cards whose `in_pool` is false are kept
  (Penny Pincher, the Manhunt voucher, the Ward Tag): the ruleset lists them in `closed`. Orange
  Deck's Giga Standard Pack is a Booster with weight 0, so it counts too (`added.boosters`).
- It sorts each list by key, then runs `pseudoshuffle(list, pseudoseed("<pool>_mp_smallworld"))`.
  The Order only takes over shuffles of playing cards, so this is vanilla's: `math.randomseed`,
  then a swap of each i with `math.random(i)` from the end.
- It bans the first `floor(0.5 + n * 0.75)`, or one fewer for vouchers (the count starts at 2
  unless the lobby's `legacy_smallworld` is on, which the reader doesn't support). An upgrade is
  banned when its base is, and Cavendish when Gros Michel is.
- `SMODS.showman` is always true, so duplicates are allowed: cards you have are never skipped,
  and the page turns blocking off.
- The ante-1 tags and voucher are rolled inside `start_run`, before the cull
  (`lovely/ban_timing.toml` applies only the declared bans there), so they can be cards that
  are culled. A culled tag is swapped when `Tag:init` makes it (the blind screen makes the
  Small Blind's, then the Big Blind's) for `get_next_tag_key("replace")` with the ante set to 10
  under The Order: stream `Tagreplace10`. If the same tag is made again (when you skip, for
  one), it rolls again, which the reader doesn't follow. A culled ante-1 voucher is shown
  as is.
- A culled `p_buffoon_normal_1` turns off the first shop's guaranteed Buffoon Pack.
- Decks with starting vouchers (Nebula, Zodiac, Magic, …) swap a culled one through
  `get_next_voucher_key` and reroll the ante-1 voucher (`PVP.apply_fake_back_vouchers`). None
  of the reader's decks have them, so this isn't modelled.

Checked against a real Small World match (seed UXYM3NVF, Green Stake, Anaglyph Deck). None of
the 42 cards the two players bought, picked, opened or used is culled; with another seed's cull,
28 of them would be. The shop's first ten slots and the first two shops' packs (two Standard,
because the Buffoon Pack was culled, then Arcana) match the log, as does the ante-3 voucher
(Grabber). Not checked: the ante-1 tag swap (nobody skipped a culled tag).

## Assumptions

- Mod cards the ruleset doesn't use are removed from the pools (MPAPI's pool_gating, unlike
  0.5.x, which kept them as UNAVAILABLE). The Balanced pools are vanilla, with Hanging Chad,
  Bloodstone and Justice UNAVAILABLE, and `j_mp_hanging_chad` / `j_mp_bloodstone` appended to
  the Common / Uncommon pools.
- Everything is unlocked and discovered (Rare Tag needs Blueprint discovered, the upgrade
  vouchers need unlocking); the mod's matchmaking checks for a full unlock.
- No other mod adds jokers, consumables, editions, tags or packs to the pools, and Steamodded's
  optional `object_weights` feature is off.
- Each queue is read as if nothing else draws from it. In the game a card that's already owned
  or on screen is skipped (and for jokers the sticker roll is redone), and the shop's jokers
  share their queues with Buffoon Packs, Judgement, Riff-raff, the Uncommon and Rare Tags and so on.
- Planet X, Ceres and Eris are read as unlocked (their hand already played), like the
  enhancement-gated jokers and Penny Pincher are read as in the pool.
- In packs a Soul or Black Hole already in the pack isn't modelled (the game skips that roll
  while one exists).
- The first shop's forced Buffoon Pack is shown as `p_buffoon_normal_1`; whether it's art 1 or 2
  comes from an unseeded `math.random`.

## Playing cards

- Standard Packs (MultiplayerAPI `api/the_order/standard_pack.lua`): edition on
  `standard_edition0` (mod 2, no Negative, Hone/Glow Up apply), seal on `stdseal0` (over 0.8)
  and `stdsealtype0`, Enhanced on `stdset0` (over 0.6), then `Enhancedsta0` and `frontsta0`.
- Shop: `frontsho0`, `Enhancedsho0`; with Illusion, `illusion` is rolled on every shop slot,
  so the Illusion queue is read from the shop itself.
- Certificate: `cert_fr`, then Steamodded's guaranteed `poll_seal` with type key `certsl`
  (under The Order a guaranteed seal skips its chance roll). Seal types: the seal pool in order
  (Gold, Red, Blue, Purple), weight 10 each.

## Checked against a real match

`replay.test.ts` replays one player of a ranked Expanded match (seed FZZUAJBR, Violet Deck,
White Stake; the fixture holds their shops, rerolls, packs, buys and sells through Ante 4 from
the site's match log). Rolling the shop slot by slot as they rerolled, with their Buffoon Packs
and Riff-raff's jokers taken from the same queues in between, every joker they bought or picked
is where the reader puts it; every pack they opened was offered in that shop; and the vouchers
they bought are the reader's two-per-ante offers. That match also showed three things the
reader now models:

- **Enhancement-gated jokers.** Glass Joker, Steel Joker, Stone Joker, Lucky Cat and Golden
  Ticket are only in the pool while the deck has a card with that enhancement
  (`enhancement_gate`); otherwise their slot is skipped. The page has a setting for it.
- **Violet Deck** adds a voucher to every shop (`SMODS.change_voucher_limit(1)`, before the
  first ante's roll). Vouchers are rolled when an ante starts, so the shop after a boss already
  offers the next ante's.
- **Orange Deck** opens the mod's Giga Standard Pack (10 cards) first, from the same edition,
  Enhanced, enhancement and card streams as Standard Packs. Assumed: the Giga Pack keeps its own
  `create_card` (MultiplayerAPI's Standard take-over runs before PvP registers it), so its seal
  streams are `stdseal00` / `stdseal0type0`.

Later in that match the replay drifts, from things the log doesn't record: how full the joker
row was (Riff-raff and Judgement need room) and consumables made by The Emperor, High Priestess,
Vagabond and the like, which take from the shop's Tarot and Planet queues.

## What did I block? (`blocks.ts`, /what-did-i-block)

The match log on balatromp.com (`/api/proxy/runs/<id>/replay`, one gzipped event list per
player, readable once the player clicks Share) records what the player did, not what the shop
showed. The tool rolls the shop, packs and made cards again in the log's order, with what the
player held at each point, and reports every card a roll landed on and passed by: because the
player had it (orange), or because its `in_pool` wasn't met yet (blue): a gated joker, Penny
Pincher before the first PvP blind, Planet X / Ceres / Eris before their hand, Cavendish before
Gros Michel goes extinct. Cards only on screen (the shop's other slots, a pack) are skipped too,
but aren't reported. Vouchers: a roll that lands on a pair the player owns.

- Held jokers come from buys, pack picks and sells, corrected by the joker list every `play`
  event carries (that's how Riff-raff's jokers and destroyed jokers show up). Held consumables
  come from buys, from the cards the replay makes and from the deck; the log confirms a made
  one the first time it's used, sold or moved.
- A log the player hasn't shared still comes back from the API, cut down to the blinds played
  (no `run_info`). Logged in, a player sees both sides of their own matches: the page can open
  the replay file they save from `/api/proxy/runs/<id>/replay` (read in the browser, not
  uploaded). Not yet checked that the logged-in file has the other side's full events.
- Riff-raff (at the blind), Judgement, Wraith, The Soul and Top-up Tag roll from the stickerless
  queue (`Joker<r>0`); shop and pack jokers roll their stickers first and take the joker from
  `Joker<r>0_sticker` when one hits, even a joker that can't wear it (Invisible Joker rolled
  Eternal looks stickerless but came from the sticker queue: `lovely/TheOrder.toml`, "stable
  shop"). Uncommon / Rare Tags make their joker in `G.shop_jokers`, so they roll stickers too.
- Made consumables are rolled when the game makes them, with the game's room check (held +
  made in the same event < 2, +1 Crystal Ball, +negatives): Vagabond (money ≤ $4 before the
  hand; money is $4 plus every `money_delta`), Cartomancer, Séance (Straight Flush),
  Superposition, Sixth Sense, Hallucination (`halu0`), Purple Seals on discard, The Emperor and
  The High Priestess (min(2, free slots), the used card already out of its slot). Blueprint and
  Brainstorm copies count, in the joker order of the next hand. The Fool's copy, a Blue Seal's
  planet and a deck's starting consumables are made by key, without a roll. A made card the log
  shows is checked against what the replay made; if the replay made another card there, the
  queue is moved on by as many draws as it takes to make the shown one from where it was rolled.
- Decks: starting vouchers and consumables (`DECK_START`: Magic, Nebula, Ghost, Zodiac, Orange,
  Oracle, …); the log names the deck by key or by name ("Magic Deck").
- An Uncommon or Rare Tag fills every opening slot of the next shop with its joker. That's from
  a real match (stake 6, Magic Deck: both slots were the tag's, the rerolls the usual cards; 10
  of 48 shop buys matched with only the first slot, 48 of 48 with both). The Lua says the tag
  triggers once, so how it does this isn't understood; a match with Overstock and one of these
  tags would show whether it's every slot or two.
- A made joker sold or moved before the next hand counts as shown.
- The card being used still exists while it makes cards (it leaves its slot in
  `G.FUNCS.use_card`, but is destroyed only after its use), so The Emperor never makes an
  Emperor and The High Priestess never a High Priestess: its key is skipped like a held card's.
  Seen in a real match (QGISUR8I), where it fixed every Tarot after Ante 1.
- Hands are evaluated in full (`evaluateHand`: vanilla's hand order and scoring cards, with
  Four Fingers, Shortcut, Smeared, Wild, Stone and Splash). That gives the softlocked planets,
  Séance's Straight Flush, Superposition's Ace in a Straight, the last hand (a Blue Seal's
  planet is the last hand's, by key, so a matching planet with a Blue Seal in the deck takes no
  roll), and 8 Ball: each scoring 8, again for each retrigger (Red Seal, Seltzer, the mod's
  Hanging Chad on the first two scoring cards), rolls `8ball` < odds/4 while there's room.
- Cards made unseen: Incantation, Familiar, Grim and Cryptid add playing cards the log shows
  only once they're drawn (Marble Joker's Stone Cards likewise). A card first shown already
  enhanced (not picked, bought, skipped in a pack, or used on) counts from the last such card's
  use, or from the start, for the enhancement-gated jokers. Seen in IUY9B53E: an Incantation's
  Steel Card put Steel Joker in the pool long before the card was drawn.
- Only logs from Multiplayer PvP 1.0.5 are read. Older logs (1.0.3, 1.0.4) have no blind key
  on `select_blind`, no joker list on `play`, and open packs through `use`.
- The log numbers the mod's stakes after Gold (Planet 9, Spectral 10, Spectral+ 11). For the
  stickers, Planet is the reader's Orange (7), Spectral its Gold (8), Spectral+ its 9.
- Lobby avatars (a bug in Multiplayer 1.0.5, fixed in the next update): a player who looks at
  the lobby info, at any time in the run, leaves both players' avatar jokers in
  `G.GAME.used_jokers`, so their own shop and packs skip both from then on. The other player
  isn't affected unless they look too. The log records neither the avatars nor the look, so
  `findBlocksAuto` only speculates where nothing else explains a miss: the jokers the replay had
  where the player bought something else, or in a pack that showed a joker the replay didn't
  have, among the 63 the avatar picker offers (`AVATARS`;
  Obelisk, Bloodstone, Cloud 9 and the like can't be avatars), are tried as the avatars, one or
  two, blocked together from the first shop either of them missed in (or from the start). A
  guess is kept when it takes away a miss (three in a log with over 20, where one could be
  chance). `findBlocksMatch` does both logs of a match: the avatars found in either are the
  match's pair, tried in each log, and shown on a tie, as one look blocks both. The page says
  it's a guess. Confirmed by a player: their avatar is Burglar (found in four of their logs),
  and FD54Z7XN's was Hiker. Only 1.0.5 logs get this (`AVATAR_BUG`).
- MultiplayerAPI's phantom cards (`api/synced/phantom.lua`): a copy of the opponent's Let's Go
  Gambling, Pizza, Conjoined Joker or Speedrun sits in your game while they hold it. Not
  modelled (it needs the opponent's log), and not confirmed to make the pools skip it.
- When a card the log shows isn't where the replay put it, its queue is rolled on until it comes
  up, and the replay goes on from there. The held cards passed over on the way (within three
  draws) are reported as blocked, using what was held when the shop was rolled (FZZUAJBR: the
  second Campfire, skipped while the first was held, which was sold right before Brainstorm was
  bought from that shop). Each reported card is "sure" when the next card the log showed from
  that queue matched, or when that queue (each joker rarity is one) was just shown in line in
  the same shop or blind; otherwise "maybe".
- Played hands are read from the cards (rank and suit from their first sighting, then Strength,
  Death, the suit Tarots), for the three softlocked planets. Enhancements for the gated jokers
  come from the cards' refs and the enhancing Tarots.

Not modelled: Dusk's retrigger for 8 Ball (needs hands left), Perkeo, tags other than Top-up / Uncommon / Rare,
the Voucher Tag's extra voucher roll, Omen Globe, Glass Cards breaking, which planet Telescope
gives, the Cocktail and Gradient Decks' effects.

Agreement (`npx tsx scripts/check-replays.ts`): four ranked Expanded matches (VIWLATIT Magic
Deck stake 6, DKH5GTRX Orange Deck, X3UF2AUH Cocktail Deck, 63MG6TIQ Red Deck stake 6) replay
with no miss; FD54Z7XN (Plasma Deck, stake 4) misses two Uncommon shop jokers in Ante 4, not
explained yet. FZZUAJBR holds through Ante 4, then a Penny Pincher bought in Ante 5 comes two
Common rolls later than the replay has it.

Across one player's whole history (87 matches pulled while logged in, both sides of each, all
on 1.0.5 except 36 older logs that can't be read): Expanded 42 logs, 20 with no miss, 1,855 of
2,125 checks matched; Balanced 6 logs, 4 with no miss, 176 of 236; Small World 85 logs, 33
with no miss, 5,579 of 7,089 (its deck vouchers swapped by the cull aren't modelled). The most
common first miss in Expanded was a shop Uncommon, Burglar in five logs: the lobby-avatar bug
above (Burglar is that player's avatar). With avatars worked out per match: Expanded 24 of 43
logs with no miss (with FD54Z7XN), 1,984 of 2,230 checks; Balanced 180 of 236. Guessed
avatars: Burglar, Hiker, Baron (in both logs of its match), Joker, Fortune Teller, Chaos. With
packs searched too (Buffoon Packs showed avatars as well): Expanded 28 of 43 logs with no miss,
1,989 of 2,230; pairs found in both logs of a match: Lucky Cat and Showman, Joker and Stone Joker.

