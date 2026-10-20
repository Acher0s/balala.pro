"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { saveCardOverride } from "@/app/studio/actions";
import { EffectText } from "@/components/effect-text";
import type { ItemKind, Rarity } from "@/data/game-types";
import type { ItemOverride } from "@/data/overrides";
import { parseEffectLine } from "@/lib/effect-text";
import { field, primaryButton, secondaryButton } from "./forms";

export interface EditableCard {
  kind: ItemKind;
  id: string;
  image: string;
  source: string | null;
  base: { name: string; rarity?: Rarity; cost?: number; text: string[] };
  override: ItemOverride | null;
}

export function CardOverrideEditor({ cards }: { cards: EditableCard[] }) {
  const [query, setQuery] = useState("");
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [selected, setSelected] = useState<EditableCard | null>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cards
      .filter(
        (c) =>
          (!onlyChanged || c.override) &&
          (!q || c.base.name.toLowerCase().includes(q) || c.id.includes(q)),
      )
      .slice(0, 120);
  }, [cards, query, onlyChanged]);

  return (
    <div className="grid gap-4 md:grid-cols-[280px_1fr]">
      <div className="flex flex-col gap-2">
        <input
          type="search"
          placeholder="Search cards…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className={field}
        />
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={onlyChanged}
            onChange={(e) => setOnlyChanged(e.target.checked)}
          />
          Only changed cards
        </label>
        <ul className="max-h-[70vh] overflow-y-auto rounded-xl border bg-fd-card">
          {results.map((c) => (
            <li key={`${c.kind}:${c.id}`}>
              <button
                type="button"
                onClick={() => setSelected(c)}
                className={`flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-fd-accent ${
                  selected?.id === c.id && selected.kind === c.kind
                    ? "bg-fd-accent"
                    : ""
                }`}
              >
                {/* biome-ignore lint/performance/noImgElement: small sprite */}
                <img src={c.image} alt="" className="h-8 w-auto" />
                <span className="flex-1">
                  {c.override?.name ?? c.base.name}
                  <span className="block text-xs text-fd-muted-foreground">
                    {c.kind}
                    {c.source ? ` · ${c.source}` : ""}
                    {c.override ? " · changed" : ""}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      {selected ? (
        <CardForm key={`${selected.kind}:${selected.id}`} card={selected} />
      ) : (
        <p className="text-sm text-fd-muted-foreground">
          Pick a card to edit it.
        </p>
      )}
    </div>
  );
}

function CardForm({ card }: { card: EditableCard }) {
  const router = useRouter();
  const o = card.override ?? {};
  const [name, setName] = useState(o.name ?? card.base.name);
  const [rarity, setRarity] = useState<Rarity | "">(
    o.rarity ?? card.base.rarity ?? "",
  );
  const [cost, setCost] = useState(String(o.cost ?? card.base.cost ?? ""));
  const [text, setText] = useState((o.text ?? card.base.text).join("\n"));
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<string | null>(null);

  const lines = text.split("\n");
  const save = (data: ItemOverride | null) =>
    start(async () => {
      const res = await saveCardOverride(card.kind, card.id, data);
      setStatus(
        res.ok
          ? data
            ? "Saved"
            : "Reset to the game's version"
          : (res.error ?? "Failed"),
      );
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-fd-card p-4">
      <div className="flex items-start gap-4">
        {/* biome-ignore lint/performance/noImgElement: card sprite at native size */}
        <img src={card.image} alt="" style={{ imageRendering: "pixelated" }} />
        <div className="flex w-64 flex-col gap-2 rounded-xl bg-[#3a5055] p-2.5 text-center">
          <span className="font-bold text-white">{name}</span>
          <EffectText lines={lines.map((l) => parseEffectLine(l))} />
        </div>
      </div>
      <p className="text-xs text-fd-muted-foreground">
        Id in guides: <code>{card.id}</code> · {card.kind}
        {card.source ? ` · ${card.source}` : ""}
      </p>
      <label className="flex flex-col gap-1 text-sm">
        Name
        <input
          className={field}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        {card.kind === "joker" && (
          <label className="flex flex-col gap-1 text-sm">
            Rarity
            <select
              className={field}
              value={rarity}
              onChange={(e) => setRarity(e.target.value as Rarity)}
            >
              <option value="common">Common</option>
              <option value="uncommon">Uncommon</option>
              <option value="rare">Rare</option>
              <option value="legendary">Legendary</option>
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1 text-sm">
          Cost ($)
          <input
            className={field}
            type="number"
            min={0}
            value={cost}
            onChange={(e) => setCost(e.target.value)}
          />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        Effect text{" "}
        <span className="text-xs text-fd-muted-foreground">
          One line per row, like in the game
        </span>
        <textarea
          className={`${field} font-mono`}
          rows={6}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending}
          className={primaryButton}
          onClick={() =>
            save({
              name,
              rarity: rarity || undefined,
              cost: cost === "" ? undefined : Number(cost),
              text: lines,
            })
          }
        >
          Save change
        </button>
        {card.override && (
          <button
            type="button"
            disabled={pending}
            className={secondaryButton}
            onClick={() => save(null)}
          >
            Reset to game version
          </button>
        )}
        {status && (
          <span className="text-sm text-fd-muted-foreground">{status}</span>
        )}
      </div>
    </div>
  );
}
