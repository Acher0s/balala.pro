"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  deleteOverlay,
  resetOverlayLink,
  saveCardOverlay,
} from "@/app/overlays/actions";
import { FallingCards } from "@/components/falling-cards";
import { chancesValid, FallingControls } from "@/components/falling-controls";
import {
  ErrorText,
  field,
  primaryButton,
  secondaryButton,
} from "@/components/studio/forms";
import type {
  FallingCatalogEntry,
  FallingPool,
  FallingSettings,
} from "@/lib/falling";

/** A checkerboard, the usual way to show "transparent" behind the preview. */
const TRANSPARENT = {
  backgroundColor: "#2a2a2e",
  backgroundImage:
    "linear-gradient(45deg,#34343a 25%,transparent 25%,transparent 75%,#34343a 75%),linear-gradient(45deg,#34343a 25%,transparent 25%,transparent 75%,#34343a 75%)",
  backgroundSize: "24px 24px",
  backgroundPosition: "0 0,12px 12px",
};

/** The browser source link, with a copy button and how to add it to OBS. */
function SourceLink({ id }: { id: string }) {
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => setOrigin(window.location.origin), []);
  const url = `${origin}/overlay/${id}`;
  return (
    <section className="flex flex-col gap-2 rounded-xl border p-4">
      <h2 className="font-semibold">Browser source link</h2>
      <span className="flex gap-2">
        <input
          readOnly
          value={url}
          className={field}
          onFocus={(e) => e.target.select()}
        />
        <button
          type="button"
          className={secondaryButton}
          onClick={async () => {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </span>
      <ol className="list-decimal pl-5 text-sm text-fd-muted-foreground">
        <li>
          In OBS, add a <strong>Browser</strong> source and paste the link as
          its URL.
        </li>
        <li>
          Set the width and height to your canvas size, e.g. 1920 × 1080. The
          number of cards grows with the width.
        </li>
        <li>
          The background is transparent, so put the source over or under
          whatever you like.
        </li>
      </ol>
      <p className="text-xs text-fd-muted-foreground">
        Saved changes reach a running overlay within a minute, no need to
        refresh it. Anyone with this link can show this overlay, so keep it to
        yourself; resetting the link makes the old one stop working.
      </p>
    </section>
  );
}

/**
 * Makes or edits a card background overlay: the same settings as the home page's falling cards,
 * a preview on a transparent background, and once saved, the link for OBS.
 */
export function OverlayEditor({
  id,
  initialName,
  initial,
  pool,
  catalog,
}: {
  /** Undefined for a new overlay. */
  id?: string;
  initialName: string;
  initial: FallingSettings;
  pool: FallingPool;
  catalog: FallingCatalogEntry[];
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [settings, setSettings] = useState(initial);
  const [saved, setSaved] = useState({ name: initialName, settings: initial });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const changed =
    name !== saved.name ||
    JSON.stringify(settings) !== JSON.stringify(saved.settings);

  const act = (
    fn: () => Promise<{ ok: boolean; error?: string; id?: string }>,
    after: (id?: string) => void,
  ) =>
    start(async () => {
      setError(null);
      try {
        const res = await fn();
        if (!res.ok) setError(res.error ?? "Something went wrong");
        else after(res.id);
      } catch (e) {
        setError((e as Error).message);
      }
    });

  return (
    <div className="flex flex-col gap-5">
      {id && <SourceLink id={id} />}

      <label className="flex flex-col gap-1 text-sm font-medium">
        Name
        <input
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Starting soon screen"
          className={field}
        />
      </label>

      <div
        className="sticky top-16 z-10 aspect-video max-h-60 w-full overflow-hidden rounded-xl border"
        style={TRANSPARENT}
      >
        <span className="absolute top-2 left-3 z-10 rounded bg-black/60 px-1.5 text-xs text-white">
          Preview (on a stream there's no mouse, so editions shine on their own)
        </span>
        <div className="absolute inset-0">
          <FallingCards
            settings={settings}
            pool={pool}
            interactive={false}
            freshPictures
          />
        </div>
      </div>

      <FallingControls
        settings={settings}
        onChange={setSettings}
        catalog={catalog}
      />

      <ErrorText error={error} />
      <span className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={
            pending ||
            (id !== undefined && !changed) ||
            !chancesValid(settings.chances)
          }
          className={primaryButton}
          onClick={() =>
            act(
              () => saveCardOverlay(name, settings, id),
              (newId) => {
                setSaved({ name, settings });
                if (!id && newId) router.push(`/overlays/cards/${newId}`);
                else router.refresh();
              },
            )
          }
        >
          {pending ? "Saving…" : id ? "Save overlay" : "Save and get the link"}
        </button>
        {id && (
          <>
            <button
              type="button"
              disabled={!changed}
              onClick={() => {
                setName(saved.name);
                setSettings(saved.settings);
              }}
              className={secondaryButton}
            >
              Undo changes
            </button>
            <button
              type="button"
              disabled={pending}
              className={secondaryButton}
              onClick={() => {
                if (
                  window.confirm(
                    "Make a new link? The old link stops working, so update it in OBS.",
                  )
                )
                  act(
                    () => resetOverlayLink(id),
                    (newId) => router.replace(`/overlays/cards/${newId}`),
                  );
              }}
            >
              Reset link
            </button>
            <button
              type="button"
              disabled={pending}
              className={`${secondaryButton} text-red-500`}
              onClick={() => {
                if (
                  window.confirm(
                    `Delete “${saved.name}”? Its link stops working.`,
                  )
                )
                  act(
                    () => deleteOverlay(id),
                    () => router.replace("/overlays"),
                  );
              }}
            >
              Delete
            </button>
          </>
        )}
      </span>
    </div>
  );
}
