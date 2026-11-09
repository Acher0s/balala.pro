"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";

export interface LiveStreamView {
  login: string;
  name: string;
  title: string;
  viewers: number;
}

/** How often the page checks who's live, in ms. */
const REFRESH = 90_000;

/**
 * The stream player at the top of the Creators page: one live creator at a time (Twitch's own
 * player, muted until clicked), with arrows to switch. Who's live is checked again every
 * 90 seconds; when nobody is, it says so instead.
 */
export function CreatorStreams({ initial }: { initial: LiveStreamView[] }) {
  const [streams, setStreams] = useState(initial);
  const [index, setIndex] = useState(0);
  const [host, setHost] = useState<string | null>(null);

  useEffect(() => {
    // Twitch's player only plays on the domains named as its "parent".
    setHost(window.location.hostname);
    const timer = window.setInterval(async () => {
      try {
        const res = await fetch("/api/creators/live", { cache: "no-store" });
        if (res.ok)
          setStreams(
            ((await res.json()) as { streams: LiveStreamView[] }).streams,
          );
      } catch {
        // Keep showing what we have.
      }
    }, REFRESH);
    return () => window.clearInterval(timer);
  }, []);

  if (streams.length === 0)
    return (
      <div className="w-full rounded-xl border bg-fd-card px-6 py-8 text-center text-fd-muted-foreground">
        Nobody's streaming Balatro right now. Check back later, or find
        everyone's channels below.
      </div>
    );

  const current = streams[Math.min(index, streams.length - 1)];
  const step = (by: number) =>
    setIndex((i) => (i + by + streams.length) % streams.length);
  const arrow =
    "flex size-10 shrink-0 items-center justify-center rounded-full border bg-fd-card hover:bg-fd-accent disabled:opacity-30";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Previous stream"
          className={arrow}
          disabled={streams.length < 2}
          onClick={() => step(-1)}
        >
          <ChevronLeft className="size-5" />
        </button>
        <div className="aspect-video w-full overflow-hidden rounded-xl border bg-black">
          {host && (
            <iframe
              key={current.login}
              title={`${current.name} on Twitch`}
              src={`https://player.twitch.tv/?channel=${encodeURIComponent(current.login)}&parent=${encodeURIComponent(host)}&muted=true`}
              allowFullScreen
              className="h-full w-full"
            />
          )}
        </div>
        <button
          type="button"
          aria-label="Next stream"
          className={arrow}
          disabled={streams.length < 2}
          onClick={() => step(1)}
        >
          <ChevronRight className="size-5" />
        </button>
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-12 text-sm">
        <span className="min-w-0">
          <span className="mr-2 rounded bg-red-600 px-1.5 py-0.5 text-xs font-bold text-white">
            LIVE
          </span>
          <a
            href={`https://twitch.tv/${current.login}`}
            target="_blank"
            rel="noreferrer"
            className="font-semibold hover:underline"
          >
            {current.name}
          </a>
          <span className="text-fd-muted-foreground"> · {current.title}</span>
        </span>
        <span className="text-xs text-fd-muted-foreground tabular-nums">
          {current.viewers.toLocaleString("en")} watching
          {streams.length > 1 &&
            ` · ${Math.min(index, streams.length - 1) + 1} of ${streams.length}`}
        </span>
      </div>
    </div>
  );
}
