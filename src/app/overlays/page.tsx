import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser, loginUrl } from "@/lib/auth";
import { listOwnOverlays, OVERLAY_LIMIT } from "@/lib/overlays";

export const metadata: Metadata = { title: "Overlays" };

/** The overlays there are; one so far. */
const KINDS = [
  {
    href: "/overlays/cards",
    title: "Balatro card background overlay",
    description:
      "Jokers, playing cards, tarots and more falling across your stream, with the game's own editions, enhancements and seals. Pick the mix, speed, size and spawn chances.",
  },
];

export default async function OverlaysPage() {
  const user = await getCurrentUser();
  const own = user ? await listOwnOverlays(user.id) : [];
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10">
      <div>
        <h1 className="text-3xl font-bold">Overlays</h1>
        <p className="text-fd-muted-foreground">
          Balatro-themed browser sources for your stream, for OBS or any
          streaming app that shows web pages.
        </p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2">
        {KINDS.map((kind) => (
          <div
            key={kind.href}
            className="flex flex-col gap-3 rounded-xl border p-4"
          >
            <h2 className="font-semibold">{kind.title}</h2>
            <p className="text-sm text-fd-muted-foreground">
              {kind.description}
            </p>
            <Link
              href={user ? kind.href : loginUrl(kind.href)}
              className="mt-auto self-start rounded-md bg-fd-primary px-4 py-2 text-sm font-medium text-fd-primary-foreground"
            >
              {user ? "Make one" : "Sign in to make one"}
            </Link>
          </div>
        ))}
      </section>

      {user && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">
            Your overlays{" "}
            <span className="text-sm font-normal text-fd-muted-foreground">
              {own.length} of {OVERLAY_LIMIT}
            </span>
          </h2>
          {own.length === 0 ? (
            <p className="text-sm text-fd-muted-foreground">
              You haven't made any overlays yet.
            </p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {own.map((o) => (
                <li key={o.id}>
                  <Link
                    href={`/overlays/cards/${o.id}`}
                    className="flex flex-col rounded-xl border p-3 hover:bg-fd-accent"
                  >
                    <span className="font-medium">{o.name}</span>
                    <span className="text-xs text-fd-muted-foreground">
                      Card background · changed{" "}
                      {o.updatedAt.toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}
