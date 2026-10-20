import { HoverCard } from "@/components/game-ref";
import { getItemExact } from "@/data/game";
import type { ItemKind } from "@/data/game-types";
import type { TierListData } from "@/lib/tierlist-shared";
import { resolveRef } from "@/lib/tierlists";
import { TierThumbImage } from "./tier-thumb";

/** A finished tier list, read-only (its page and embeds). Hover a card for its effect. */
export function TierBoard({ data }: { data: TierListData }) {
  return (
    <div className="not-prose overflow-hidden rounded-md border border-black bg-[#1a1a17] text-black">
      {data.tiers.map((tier) => (
        <div
          key={tier.id}
          className="flex min-h-[96px] border-b border-black last:border-b-0"
        >
          <div
            className="flex w-24 shrink-0 items-center justify-center break-words p-2 text-center text-lg font-semibold sm:w-28"
            style={{ background: tier.color }}
          >
            {tier.label}
          </div>
          <div className="flex min-w-0 flex-1 flex-wrap content-start gap-0.5 p-0.5">
            {tier.items.map((ref) => {
              const item = resolveRef(ref);
              if (!item) return null;
              const [kind, id] = [
                ref.slice(0, ref.indexOf(":")),
                ref.slice(ref.indexOf(":") + 1),
              ];
              const game =
                kind === "card"
                  ? undefined
                  : getItemExact(kind as ItemKind, id);
              return (
                <span
                  key={ref}
                  className="group relative"
                  title={game ? undefined : item.name}
                >
                  <button
                    type="button"
                    className="block cursor-default"
                    aria-label={item.name}
                  >
                    <TierThumbImage layers={item.layers} />
                  </button>
                  {game && <HoverCard item={game} />}
                </span>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
