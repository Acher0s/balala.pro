"use client";

import { useState } from "react";
import { saveSiteTool } from "@/app/studio/actions";
import { ErrorText, field, primaryButton, useAction } from "./forms";

/**
 * A built-in tool's description, tags and banner cards (Studio → Site → Built-in tools). The
 * tile beside it shows the saved version.
 */
export function SiteToolForm({
  href,
  description,
  tags,
  icon,
}: {
  href: string;
  description: string;
  tags: string[];
  icon: string[];
}) {
  const { pending, error, run } = useAction();
  const [saved, setSaved] = useState(false);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        run(
          () =>
            saveSiteTool(href, {
              description: String(fd.get("description")),
              tags: String(fd.get("tags")),
              icon: String(fd.get("icon")),
            }),
          () => setSaved(true),
        );
      }}
      onChange={() => setSaved(false)}
      className="flex flex-col gap-2"
    >
      <label className="flex flex-col gap-1 text-sm">
        Description
        <textarea
          name="description"
          defaultValue={description}
          rows={2}
          className={field}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Tags
        <input name="tags" defaultValue={tags.join(", ")} className={field} />
        <span className="text-xs text-fd-muted-foreground">
          Separated by commas. They decide the category on the Tools page.
        </span>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Banner cards
        <input name="icon" defaultValue={icon.join(", ")} className={field} />
        <span className="text-xs text-fd-muted-foreground">
          Up to 3, separated by commas, the first on top: joker:the_order,
          tarot:hermit, card:KH.
        </span>
      </label>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={primaryButton}>
          {pending ? "Saving…" : "Save"}
        </button>
        {saved && !pending && (
          <span className="text-sm text-fd-muted-foreground">Saved.</span>
        )}
      </div>
      <ErrorText error={error} />
    </form>
  );
}
