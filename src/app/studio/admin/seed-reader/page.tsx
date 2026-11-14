import Link from "next/link";
import { AutoRefresh } from "@/components/studio/auto-refresh";
import { Panel } from "@/components/studio/forms";
import { requireUser } from "@/lib/auth";
import {
  activeSeeds,
  type LookupView,
  lookupHistory,
} from "@/lib/seed-lookups";
import { ACTIVE_MINUTES } from "@/lib/seed-lookups-shared";

const PAGE = "/studio/admin/seed-reader";
const HISTORY = 100;

const time = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

/** Who read it: the signed-in user, or the tab and (hashed) address it came from. */
function Who({ l }: { l: Pick<LookupView, "user" | "clientId" | "ipHash"> }) {
  return (
    <span className="text-fd-muted-foreground">
      {l.user ? (
        <span className="text-fd-foreground">
          {l.user.displayName} (@{l.user.username})
        </span>
      ) : (
        "not signed in"
      )}{" "}
      · tab <code>{l.clientId.slice(0, 6)}</code>
      {l.ipHash && (
        <>
          {" "}
          · IP <code>{l.ipHash.slice(0, 8)}</code>
        </>
      )}
    </span>
  );
}

/**
 * Admins only: which seeds the seed reader (/seed-reader) is reading right now, and every
 * lookup before that. The page refreshes itself every 30 seconds.
 */
export default async function SeedReaderAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ seed?: string; before?: string }>;
}) {
  await requireUser("admin", PAGE);
  const { seed, before } = await searchParams;
  const beforeDate = before ? new Date(before) : undefined;
  const [active, history] = await Promise.all([
    activeSeeds(),
    lookupHistory({
      seed: seed || undefined,
      before:
        beforeDate && !Number.isNaN(beforeDate.getTime())
          ? beforeDate
          : undefined,
      limit: HISTORY,
    }),
  ]);
  const older =
    history.length === HISTORY ? history[history.length - 1].createdAt : null;
  const link = (params: Record<string, string | undefined>) => {
    const q = new URLSearchParams(
      Object.entries(params).flatMap(([k, v]) => (v ? [[k, v]] : [])),
    ).toString();
    return q ? `${PAGE}?${q}` : PAGE;
  };

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-10">
      <AutoRefresh seconds={30} />
      <div>
        <h1 className="text-2xl font-bold">Seed reader</h1>
        <p className="text-sm text-fd-muted-foreground">
          Every seed read with the{" "}
          <Link href="/seed-reader" className="underline">
            seed reader
          </Link>
          , as it reads them. Readers are told apart by their account if they're
          signed in, a random id per browser tab, and a salted hash of their IP.
          The same is available from the API (
          <code>/api/seed-reader/active</code>,{" "}
          <code>/api/seed-reader/lookups</code>) with a{" "}
          <Link href="/studio/admin/api-keys" className="underline">
            key
          </Link>{" "}
          that has the <code>seed-reader:read</code> scope.
        </p>
      </div>

      <Panel title={`Being read now (last ${ACTIVE_MINUTES} minutes)`}>
        {active.length === 0 ? (
          <p className="text-sm text-fd-muted-foreground">
            No seeds read in the last {ACTIVE_MINUTES} minutes.
          </p>
        ) : (
          <ul className="divide-y rounded-xl border bg-fd-card text-sm">
            {active.map((a) => (
              <li key={a.seed} className="flex flex-col gap-1 px-4 py-3">
                <span className="flex flex-wrap items-baseline gap-x-3">
                  <Link
                    href={link({ seed: a.seed })}
                    className="font-mono text-base font-bold underline"
                  >
                    {a.seed}
                  </Link>
                  <span className="text-fd-muted-foreground">
                    {a.lookups} lookup{a.lookups === 1 ? "" : "s"} by{" "}
                    {a.readers} reader{a.readers === 1 ? "" : "s"} ·{" "}
                    {a.rulesets.join(", ")} · {time(a.firstAt)} –{" "}
                    {time(a.lastAt)}
                  </span>
                </span>
                <span className="text-fd-muted-foreground">
                  {a.users.length > 0
                    ? a.users
                        .map((u) => `${u.displayName} (@${u.username})`)
                        .join(", ")
                    : "nobody signed in"}
                  {a.ipHashes.length > 0 &&
                    ` · IPs ${a.ipHashes.map((h) => h.slice(0, 8)).join(", ")}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        title={seed ? `History of ${seed}` : "History"}
        actions={
          <form action={PAGE} className="flex items-center gap-2 text-sm">
            <input
              name="seed"
              defaultValue={seed ?? ""}
              placeholder="Seed"
              className="w-32 rounded-md border bg-fd-background px-2 py-1 font-mono uppercase"
            />
            <button
              type="submit"
              className="rounded-md border px-2 py-1 hover:bg-fd-accent"
            >
              Filter
            </button>
            {seed && (
              <Link href={PAGE} className="underline">
                All seeds
              </Link>
            )}
          </form>
        }
      >
        {history.length === 0 ? (
          <p className="text-sm text-fd-muted-foreground">No lookups.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-fd-card">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-fd-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">When</th>
                  <th className="px-3 py-2 font-medium">Seed</th>
                  <th className="px-3 py-2 font-medium">Settings</th>
                  <th className="px-3 py-2 font-medium">Who</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {history.map((l) => (
                  <tr key={l.id}>
                    <td className="whitespace-nowrap px-3 py-2">
                      {time(l.createdAt)}
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        href={link({ seed: l.seed })}
                        className="font-mono underline"
                      >
                        {l.seed}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-fd-muted-foreground">
                      {l.ruleset} · stake {l.stake}
                      {l.deck ? ` · ${l.deck}` : ""} · {l.patch}
                    </td>
                    <td className="px-3 py-2">
                      <Who l={l} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex gap-3 text-sm">
          {before && (
            <Link href={link({ seed })} className="underline">
              Newest
            </Link>
          )}
          {older && (
            <Link href={link({ seed, before: older })} className="underline">
              Older
            </Link>
          )}
        </div>
      </Panel>
    </main>
  );
}
