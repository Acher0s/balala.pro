import type { Metadata } from "next";
import { CreatorStreams } from "@/components/creator-streams";
import { publicCreators } from "@/lib/creators";
import { liveBalatroStreams } from "@/lib/twitch";

export const metadata: Metadata = {
  title: "Creators",
  description: "Balatro Multiplayer creators, and where to find them.",
};

export default async function CreatorsPage() {
  const creators = await publicCreators();
  const live = await liveBalatroStreams(
    creators.flatMap((c) => (c.twitch ? [c.twitch] : [])),
  );
  const liveLogins = new Set(live.map((s) => s.login));

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10">
      <div>
        <h1 className="text-3xl font-bold">Creators</h1>
        <p className="text-fd-muted-foreground">
          People making Balatro Multiplayer content, and where to find them.
        </p>
      </div>

      <CreatorStreams initial={live} />

      {creators.length === 0 ? (
        <p className="text-fd-muted-foreground">No creators listed yet.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {creators.map((c) => {
            const isLive =
              c.twitch !== null && liveLogins.has(c.twitch.toLowerCase());
            const links = [
              ...(c.twitch
                ? [{ label: "Twitch", url: `https://twitch.tv/${c.twitch}` }]
                : []),
              ...c.links,
            ];
            return (
              <li
                key={c.id}
                className="flex flex-col gap-3 rounded-xl border bg-fd-card p-4"
              >
                <div className="flex items-center gap-3">
                  {c.image ? (
                    // biome-ignore lint/performance/noImgElement: remote avatar from Twitch or the admin
                    <img
                      src={c.image}
                      alt=""
                      className="size-12 rounded-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <span className="flex size-12 items-center justify-center rounded-full bg-fd-secondary text-lg font-bold">
                      {c.name[0]?.toUpperCase()}
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">
                      {c.name}
                    </span>
                    {isLive && (
                      <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                        LIVE NOW
                      </span>
                    )}
                  </span>
                </div>
                {c.bio && (
                  <p className="text-sm text-fd-muted-foreground">{c.bio}</p>
                )}
                {links.length > 0 && (
                  <div className="mt-auto flex flex-wrap gap-1.5">
                    {links.map((l) => (
                      <a
                        key={l.url}
                        href={l.url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-md border px-2 py-1 text-xs hover:bg-fd-accent"
                      >
                        {l.label}
                      </a>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-sm text-fd-muted-foreground">
        Want to be added, change your card, or be taken off this page? Message{" "}
        <strong className="text-fd-foreground">_acheros</strong> on Discord and
        it'll be sorted out.
      </p>
    </main>
  );
}
