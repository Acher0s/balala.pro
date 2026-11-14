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
- Planet X, Ceres and Eris are treated as locked (their hand not played yet).
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
