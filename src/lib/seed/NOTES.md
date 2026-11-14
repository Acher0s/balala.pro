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
