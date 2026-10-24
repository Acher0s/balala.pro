import { lineToCode } from "@/components/effect-text";
import {
  CardOverrideEditor,
  type EditableCard,
} from "@/components/studio/card-override-editor";
import { getBaseItem, listItemEntries, sourceLabel } from "@/data/game";
import type { ItemKind } from "@/data/game-types";
import type { ItemOverride } from "@/data/overrides";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";

const KINDS: ItemKind[] = [
  "joker",
  "tarot",
  "planet",
  "spectral",
  "voucher",
  "enhancement",
  "seal",
  "deck",
  "stake",
  "tag",
  "booster",
  "sticker",
];

export default async function CardsPage() {
  await requireUser("admin");
  const db = await getDb();
  const overrides = new Map(
    (await db.select().from(schema.cardOverrides)).map((o) => [
      `${o.kind}:${o.itemId}`,
      o.data as ItemOverride,
    ]),
  );

  const cards: EditableCard[] = KINDS.flatMap((kind) =>
    listItemEntries(kind).map(([id, item]) => {
      const base = getBaseItem(kind, id) ?? item;
      return {
        kind,
        id,
        image: item.image,
        source: sourceLabel(item.source),
        base: {
          name: base.name,
          rarity: base.rarity,
          cost: base.cost,
          text: base.text.map(lineToCode),
        },
        override: overrides.get(`${kind}:${id}`) ?? null,
      };
    }),
  );

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-10">
      <div>
        <h1 className="text-2xl font-bold">Cards</h1>
        <p className="text-sm text-fd-muted-foreground">
          Change how a card is shown in guides, e.g. for a BMP balance change.
          Text uses the game's colour codes:
          <code className="mx-1">{"{C:mult}+4{} Mult"}</code>
          <code className="mx-1">{"{X:mult,C:white} X2 {} Mult"}</code>. Changes
          apply immediately.
        </p>
      </div>
      <CardOverrideEditor cards={cards} />
    </main>
  );
}
