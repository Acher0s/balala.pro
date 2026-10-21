"use client";

import { useMemo, useState } from "react";
import { deleteGuides } from "@/app/studio/actions";
import {
  ErrorText,
  field,
  secondaryButton,
  useAction,
} from "@/components/studio/forms";

export interface CleanupRow {
  id: string;
  kind: "guide" | "tool";
  title: string;
  url: string;
  status: "draft" | "published" | "changed";
  author: string;
  updatedAt: string;
}

const STATUS_LABEL: Record<CleanupRow["status"], string> = {
  draft: "Draft",
  published: "Live",
  changed: "Live, unpublished changes",
};

const dangerButton =
  "rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50";

/** Pick guides and tools with filters and checkboxes, then delete them in one go. */
export function BulkDeleteForm({ rows }: { rows: CleanupRow[] }) {
  const { pending, error, run } = useAction();
  const [status, setStatus] = useState<"all" | CleanupRow["status"]>("all");
  const [kind, setKind] = useState<"all" | CleanupRow["kind"]>("all");
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<Set<string>>(new Set());

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (status === "all" || r.status === status) &&
        (kind === "all" || r.kind === kind) &&
        (!q ||
          r.title.toLowerCase().includes(q) ||
          r.url.includes(q) ||
          r.author.toLowerCase().includes(q)),
    );
  }, [rows, status, kind, query]);

  // Only what's still listed counts, so a filter change never deletes hidden pages.
  const selected = visible.filter((r) => chosen.has(r.id));
  const allVisibleChosen =
    visible.length > 0 && visible.every((r) => chosen.has(r.id));

  const toggle = (id: string) =>
    setChosen((s) => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const toggleAll = () =>
    setChosen((s) => {
      const next = new Set(s);
      for (const r of visible)
        if (allVisibleChosen) next.delete(r.id);
        else next.add(r.id);
      return next;
    });

  const remove = () => {
    const live = selected.filter((r) => r.status !== "draft").length;
    const message =
      `Delete ${selected.length} ${selected.length === 1 ? "page" : "pages"} and their history?` +
      (live
        ? ` ${live} of them ${live === 1 ? "is" : "are"} live on the site.`
        : "") +
      " This can't be undone.";
    if (!confirm(message)) return;
    run(
      () => deleteGuides(selected.map((r) => r.id)),
      () => setChosen(new Set()),
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
          className={`${field} sm:w-auto`}
        >
          <option value="all">Any status</option>
          <option value="draft">Drafts only</option>
          <option value="changed">Live, unpublished changes</option>
          <option value="published">Live</option>
        </select>
        <select
          aria-label="Kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as typeof kind)}
          className={`${field} sm:w-auto`}
        >
          <option value="all">Guides and tools</option>
          <option value="guide">Guides</option>
          <option value="tool">Tools</option>
        </select>
        <input
          type="search"
          placeholder="Search title, address or author"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className={`${field} min-w-48 flex-1`}
        />
      </div>

      <div className="overflow-x-auto rounded-xl border bg-fd-card">
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs text-fd-muted-foreground">
            <tr>
              <th className="w-10 p-3">
                <input
                  type="checkbox"
                  aria-label="Select all listed"
                  checked={allVisibleChosen}
                  disabled={visible.length === 0}
                  onChange={toggleAll}
                />
              </th>
              <th className="p-3 font-medium">Title</th>
              <th className="p-3 font-medium">Status</th>
              <th className="p-3 font-medium">Author</th>
              <th className="p-3 font-medium">Last edited</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {visible.length === 0 && (
              <tr>
                <td colSpan={5} className="p-4 text-fd-muted-foreground">
                  Nothing matches.
                </td>
              </tr>
            )}
            {visible.map((r) => (
              <tr
                key={r.id}
                className={chosen.has(r.id) ? "bg-fd-accent/60" : ""}
              >
                <td className="p-3">
                  <input
                    type="checkbox"
                    aria-label={`Select ${r.title}`}
                    checked={chosen.has(r.id)}
                    onChange={() => toggle(r.id)}
                  />
                </td>
                <td className="p-3">
                  <a
                    href={`/studio/guides/${r.id}`}
                    className="font-medium hover:underline"
                  >
                    {r.title}
                  </a>
                  <span className="block text-xs text-fd-muted-foreground">
                    {r.kind === "tool" ? "Tool" : "Guide"} · {r.url}
                  </span>
                </td>
                <td
                  className={
                    r.status === "draft"
                      ? "p-3 text-fd-muted-foreground"
                      : "p-3 text-amber-600 dark:text-amber-400"
                  }
                >
                  {STATUS_LABEL[r.status]}
                </td>
                <td className="p-3 text-fd-muted-foreground">{r.author}</td>
                <td className="p-3 whitespace-nowrap text-fd-muted-foreground">
                  {new Date(r.updatedAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ErrorText error={error} />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={remove}
          disabled={pending || selected.length === 0}
          className={dangerButton}
        >
          {pending
            ? "Deleting…"
            : `Delete ${selected.length} ${selected.length === 1 ? "page" : "pages"}`}
        </button>
        {selected.length > 0 && (
          <button
            type="button"
            onClick={() => setChosen(new Set())}
            className={secondaryButton}
          >
            Clear selection
          </button>
        )}
      </div>
    </div>
  );
}
