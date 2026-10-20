import Link from "next/link";
import type { TierListData } from "@/lib/tierlist-shared";
import { getTierList } from "@/lib/tierlists";
import { TierBoard } from "./tier-board";

/** Embeds a published tier list in a guide or tool: <TierList id="…" />. */
export async function TierList({ id }: { id: string }) {
  const found = await getTierList(id);
  if (!found || found.list.status !== "published") {
    return (
      <p className="rounded-lg border border-dashed p-3 text-sm text-fd-muted-foreground">
        This tier list isn't available right now.
      </p>
    );
  }
  const { list, ownerName } = found;
  return (
    <figure className="not-prose my-6 flex flex-col gap-2">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <span>
          <span className="font-semibold">{list.title}</span>
          <span className="text-sm text-fd-muted-foreground">
            {" "}
            · tier list by {ownerName}
          </span>
        </span>
        <Link
          href={`/tierlists/${list.id}`}
          className="text-sm text-fd-muted-foreground hover:text-fd-foreground"
        >
          Open ↗
        </Link>
      </figcaption>
      <TierBoard data={list.data as TierListData} />
    </figure>
  );
}
