"use client";

import { useMemo, useState } from "react";
import { saveSiteCategories } from "@/app/studio/actions";
import {
  ErrorText,
  field,
  primaryButton,
  secondaryButton,
  useAction,
} from "@/components/studio/forms";
import { type CategorySettings, normalizeTag } from "@/lib/categories";

interface Row {
  /** Stable key while editing, so inputs keep focus when rows move. */
  key: number;
  name: string;
  /** Comma-separated while editing. */
  tags: string;
}

const splitTags = (text: string) =>
  text
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

/**
 * Studio → Site → Categories: named groups of tags for the Guides and Tools pages. A page goes in
 * the first category with one of its tags; the rest go under the catch-all.
 */
export function CategoriesForm({
  initial,
  tagsInUse,
}: {
  initial: CategorySettings;
  /** Every tag on a published guide or tool, with how many pages use it. */
  tagsInUse: { tag: string; count: number }[];
}) {
  const { pending, error, run } = useAction();
  const [nextKey, setNextKey] = useState(initial.categories.length);
  const [rows, setRows] = useState<Row[]>(() =>
    initial.categories.map((c, key) => ({
      key,
      name: c.name,
      tags: c.tags.join(", "),
    })),
  );
  const [othersName, setOthersName] = useState(initial.othersName);
  const [everyMatch, setEveryMatch] = useState(initial.everyMatch);
  const [saved, setSaved] = useState(false);

  const change = (next: Row[]) => {
    setRows(next);
    setSaved(false);
  };
  const update = (key: number, patch: Partial<Row>) =>
    change(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const move = (i: number, by: number) => {
    const next = [...rows];
    const [row] = next.splice(i, 1);
    next.splice(i + by, 0, row);
    change(next);
  };

  // Which category each tag in use ends up in, to show what lands in the catch-all.
  const covered = useMemo(() => {
    const tags = new Set<string>();
    for (const r of rows)
      for (const t of splitTags(r.tags)) tags.add(normalizeTag(t));
    return tags;
  }, [rows]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () =>
            saveSiteCategories({
              categories: rows.map((r) => ({
                name: r.name,
                tags: splitTags(r.tags),
              })),
              othersName,
              everyMatch,
            }),
          () => setSaved(true),
        );
      }}
      className="flex flex-col gap-3"
    >
      <p className="text-sm text-fd-muted-foreground">
        Groups on the Guides and Tools pages. A guide or tool goes in the first
        category, top to bottom, that has one of its tags (or in every matching
        one, see below). Without categories, pages are grouped by their section.
      </p>
      {rows.length === 0 && (
        <p className="rounded-lg border border-dashed p-3 text-sm text-fd-muted-foreground">
          No categories yet.
        </p>
      )}
      <ol className="flex flex-col gap-2">
        {rows.map((r, i) => (
          <li
            key={r.key}
            className="flex flex-wrap items-end gap-2 rounded-lg border bg-fd-card p-3"
          >
            <label className="flex min-w-32 flex-1 flex-col gap-1 text-xs">
              Name
              <input
                value={r.name}
                onChange={(e) => update(r.key, { name: e.target.value })}
                placeholder="e.g. Stakes"
                className={field}
              />
            </label>
            <label className="flex min-w-48 flex-[2] flex-col gap-1 text-xs">
              Tags (comma-separated)
              <input
                value={r.tags}
                onChange={(e) => update(r.key, { tags: e.target.value })}
                placeholder="e.g. white stake, black stake"
                className={field}
              />
            </label>
            <span className="flex gap-1">
              <button
                type="button"
                aria-label="Move up"
                disabled={i === 0}
                onClick={() => move(i, -1)}
                className={secondaryButton}
              >
                ↑
              </button>
              <button
                type="button"
                aria-label="Move down"
                disabled={i === rows.length - 1}
                onClick={() => move(i, 1)}
                className={secondaryButton}
              >
                ↓
              </button>
              <button
                type="button"
                aria-label="Remove"
                onClick={() => change(rows.filter((x) => x.key !== r.key))}
                className={secondaryButton}
              >
                ✕
              </button>
            </span>
          </li>
        ))}
      </ol>
      <button
        type="button"
        onClick={() => {
          change([...rows, { key: nextKey, name: "", tags: "" }]);
          setNextKey(nextKey + 1);
        }}
        className={`${secondaryButton} self-start`}
      >
        Add category
      </button>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={everyMatch}
          onChange={(e) => {
            setEveryMatch(e.target.checked);
            setSaved(false);
          }}
          className="mt-1"
        />
        <span>
          Show a page in every category it matches
          <span className="block text-xs text-fd-muted-foreground">
            Off: a page tagged both jokers and white stake only shows in the
            first of those categories. On: it shows in both.
          </span>
        </span>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Everything else
        <input
          value={othersName}
          onChange={(e) => {
            setOthersName(e.target.value);
            setSaved(false);
          }}
          placeholder="No heading"
          className={field}
        />
        <span className="text-xs text-fd-muted-foreground">
          Heading for guides and tools that match no category. Leave empty for
          no heading.
        </span>
      </label>
      {tagsInUse.length > 0 && (
        <div className="flex flex-col gap-1.5 text-xs">
          <span className="text-fd-muted-foreground">
            Tags in use (crossed out: in a category; the rest go under &ldquo;
            {othersName || "no heading"}&rdquo;)
          </span>
          <span className="flex flex-wrap gap-1">
            {tagsInUse.map(({ tag, count }) => (
              <span
                key={tag}
                className={`rounded-full border px-2 py-0.5 ${
                  covered.has(normalizeTag(tag))
                    ? "text-fd-muted-foreground line-through"
                    : ""
                }`}
              >
                {tag} ({count})
              </span>
            ))}
          </span>
        </div>
      )}
      <ErrorText error={error} />
      <span className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={primaryButton}>
          {pending ? "Saving…" : "Save categories"}
        </button>
        {saved && (
          <span className="text-sm text-fd-muted-foreground">Saved</span>
        )}
      </span>
    </form>
  );
}
