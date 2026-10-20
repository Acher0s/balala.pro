import Link from "next/link";
import type { TierListRow } from "@/db/schema";
import type { TierListData } from "@/lib/tierlist-shared";
import { resolveRef } from "@/lib/tierlists";
import { TierThumbImage } from "./tier-thumb";

/** A tier list in a grid: its title, owner and the first few top-ranked cards. */
export function TierListCard({
  list,
  ownerName,
  showStatus,
  href = `/tierlists/${list.id}`,
}: {
  list: TierListRow;
  ownerName?: string;
  showStatus?: boolean;
  /** Where the card links to (the studio links to its own editor). */
  href?: string;
}) {
  const data = list.data as TierListData;
  const top = data.tiers.flatMap((t) => t.items).slice(0, 6);
  return (
    <Link
      href={href}
      className="flex flex-col gap-2 rounded-xl border bg-fd-card p-3 hover:bg-fd-accent"
    >
      <span className="flex h-12 gap-1 overflow-hidden">
        {top.map((ref) => {
          const item = resolveRef(ref);
          return item ? (
            <TierThumbImage key={ref} layers={item.layers} small />
          ) : null;
        })}
        {top.length === 0 && (
          <span className="text-xs text-fd-muted-foreground">
            Nothing ranked yet
          </span>
        )}
      </span>
      <span className="font-semibold">{list.title}</span>
      <span className="text-xs text-fd-muted-foreground">
        {ownerName && `by ${ownerName} · `}
        {showStatus &&
          (list.status === "published" ? "Published · " : "Private · ")}
        {list.updatedAt.toLocaleDateString()}
      </span>
    </Link>
  );
}
