"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { useState } from "react";
import {
  deleteCreator,
  moveCreator,
  saveCreator,
} from "@/app/studio/admin/creators/actions";
import {
  ErrorText,
  field,
  primaryButton,
  secondaryButton,
  useAction,
} from "@/components/studio/forms";
import type { CreatorLink, CreatorRow } from "@/db/schema";

/** Links as the form shows them: one "Label | https://…" per line. */
const linksToText = (links: CreatorLink[]) =>
  links.map((l) => `${l.label} | ${l.url}`).join("\n");
const textToLinks = (text: string): CreatorLink[] =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const at = line.lastIndexOf("|");
      return at === -1
        ? { label: "", url: line }
        : { label: line.slice(0, at).trim(), url: line.slice(at + 1).trim() };
    });

/** The fields of one creator, for adding a new one or editing one. */
function CreatorForm({
  creator,
  onDone,
}: {
  creator?: CreatorRow;
  onDone?: () => void;
}) {
  const [name, setName] = useState(creator?.name ?? "");
  const [twitch, setTwitch] = useState(creator?.twitch ?? "");
  const [bio, setBio] = useState(creator?.bio ?? "");
  const [avatarUrl, setAvatarUrl] = useState(creator?.avatarUrl ?? "");
  const [links, setLinks] = useState(linksToText(creator?.links ?? []));
  const { pending, error, run } = useAction();

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () =>
            saveCreator(
              { name, twitch, bio, avatarUrl, links: textToLinks(links) },
              creator?.id,
            ),
          () => {
            if (!creator) {
              setName("");
              setTwitch("");
              setBio("");
              setAvatarUrl("");
              setLinks("");
            }
            onDone?.();
          },
        );
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Name
          <input
            className={field}
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Twitch name
          <input
            className={field}
            value={twitch}
            onChange={(e) => setTwitch(e.target.value)}
            placeholder="What comes after twitch.tv/"
          />
          <span className="text-xs font-normal text-fd-muted-foreground">
            Their stream shows at the top of the page while they're live in the
            Balatro category.
          </span>
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Bio
        <textarea
          className={field}
          rows={2}
          maxLength={300}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="A line or two about them (optional)"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Links
        <textarea
          className={`${field} font-mono`}
          rows={3}
          value={links}
          onChange={(e) => setLinks(e.target.value)}
          placeholder={
            "YouTube | https://youtube.com/@name\nX | https://x.com/name"
          }
        />
        <span className="text-xs font-normal text-fd-muted-foreground">
          One per line: a label, a |, then the address. Their Twitch is linked
          by itself.
        </span>
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Picture address
        <input
          className={field}
          value={avatarUrl}
          onChange={(e) => setAvatarUrl(e.target.value)}
          placeholder="Optional: leave empty to use their Twitch picture"
        />
      </label>
      <ErrorText error={error} />
      <span className="flex gap-2">
        <button type="submit" disabled={pending} className={primaryButton}>
          {pending ? "Saving…" : creator ? "Save" : "Add creator"}
        </button>
        {creator && onDone && (
          <button type="button" onClick={onDone} className={secondaryButton}>
            Cancel
          </button>
        )}
      </span>
    </form>
  );
}

/** Studio → Creators: everyone on the Creators page, in page order. */
export function CreatorsEditor({ creators }: { creators: CreatorRow[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const { pending, error, run } = useAction();

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 rounded-xl border p-4">
        <h2 className="font-semibold">Add a creator</h2>
        <CreatorForm />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">On the page ({creators.length})</h2>
        <ErrorText error={error} />
        {creators.length === 0 && (
          <p className="text-sm text-fd-muted-foreground">No creators yet.</p>
        )}
        <ul className="flex flex-col gap-2">
          {creators.map((c, i) => (
            <li key={c.id} className="rounded-lg border p-3">
              {editing === c.id ? (
                <CreatorForm creator={c} onDone={() => setEditing(null)} />
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <span className="flex flex-col">
                    <button
                      type="button"
                      aria-label={`Move ${c.name} up`}
                      disabled={pending || i === 0}
                      onClick={() => run(() => moveCreator(c.id, -1))}
                      className="rounded p-0.5 hover:bg-fd-accent disabled:opacity-30"
                    >
                      <ArrowUp className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${c.name} down`}
                      disabled={pending || i === creators.length - 1}
                      onClick={() => run(() => moveCreator(c.id, 1))}
                      className="rounded p-0.5 hover:bg-fd-accent disabled:opacity-30"
                    >
                      <ArrowDown className="size-3.5" />
                    </button>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{c.name}</span>
                    <span className="block truncate text-xs text-fd-muted-foreground">
                      {c.twitch ? `twitch.tv/${c.twitch}` : "No Twitch"}
                      {c.links.length > 0 &&
                        ` · ${c.links.map((l) => l.label).join(", ")}`}
                    </span>
                  </span>
                  <button
                    type="button"
                    className={secondaryButton}
                    onClick={() => setEditing(c.id)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    className={`${secondaryButton} text-red-500`}
                    onClick={() => {
                      if (window.confirm(`Remove ${c.name} from the page?`))
                        run(() => deleteCreator(c.id));
                    }}
                  >
                    Remove
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
