"use client";

import {
  type ChangeEvent,
  type FormEvent,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { SeedArt } from "@/components/seed-reader/art";
import { ArtContext, ItemCard } from "@/components/seed-reader/seed-card";
import {
  type BlockHit,
  type BlockReason,
  type BlockReport,
  findBlocksMatch,
  type MatchPlayerLog,
  matchSettings,
} from "@/lib/seed/blocks";
import {
  browserGunzip,
  isReadable,
  type ReplayResponse,
  readReplay,
} from "@/lib/seed/replay-file";

const COLOUR: Record<BlockReason, string> = {
  held: "#ff9a00",
  locked: "#009dff",
};
const LABEL: Record<BlockReason, string> = {
  held: "You had it",
  locked: "Not unlocked yet",
};

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** The match id in a balatromp.com match link, or the id itself. */
function matchId(input: string): string | undefined {
  return UUID.exec(input.trim())?.[0].toLowerCase();
}

type Loaded =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "error"; error: string }
  | { state: "done"; logs: MatchPlayerLog[] };

/** "What did I block?": a shared match's logs, replayed through the seed reader. */
export function BlockCheck({ art }: { art: SeedArt }) {
  const [input, setInput] = useState("");
  const [loaded, setLoaded] = useState<Loaded>({ state: "idle" });

  const load = async (id: string) => {
    setLoaded({ state: "loading" });
    try {
      const res = await fetch(`/api/what-did-i-block/${id}`);
      const body = await res.json();
      if (!res.ok)
        setLoaded({ state: "error", error: body.error ?? "That didn't work." });
      else setLoaded({ state: "done", logs: body.logs });
    } catch {
      setLoaded({ state: "error", error: "The match couldn't be loaded." });
    }
  };

  // A link to this page can carry the match: /what-did-i-block?match=<id>.
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, on load
  useEffect(() => {
    const id = matchId(
      new URLSearchParams(window.location.search).get("match") ?? "",
    );
    if (id) {
      setInput(`https://balatromp.com/matches/${id}`);
      load(id);
    }
  }, []);

  /** A replay file the player saved while logged in: it has both sides of their own match. */
  const openFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setLoaded({ state: "loading" });
    try {
      const data = JSON.parse(await file.text()) as ReplayResponse;
      if (!Array.isArray(data.logs)) throw new Error("no logs");
      const { logs } = await readReplay(data, browserGunzip);
      setLoaded({ state: "done", logs });
    } catch {
      setLoaded({
        state: "error",
        error:
          "That file isn't a match replay. Save the replay link's page as a .json file.",
      });
    }
  };

  const idForHelp = matchId(input);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const id = matchId(input);
    if (!id) {
      setLoaded({
        state: "error",
        error: "Paste a match link, like https://balatromp.com/matches/…",
      });
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.set("match", id);
    window.history.replaceState(null, "", url);
    load(id);
  };

  return (
    <ArtContext.Provider value={art}>
      <div className="flex max-w-5xl flex-col gap-6">
        <form onSubmit={submit} className="flex flex-wrap gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="https://balatromp.com/matches/…"
            aria-label="Match link"
            className="min-w-0 flex-1 rounded-md border bg-fd-background px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={loaded.state === "loading"}
            className="rounded-md bg-fd-primary px-4 py-2 text-sm font-semibold text-fd-primary-foreground disabled:opacity-50"
          >
            {loaded.state === "loading" ? "Loading…" : "Read match"}
          </button>
        </form>
        <p className="text-sm text-fd-muted-foreground">
          On the match page, click <strong>Share</strong> first: a log that
          isn't shared can't be read. Only matches played with The Order can be
          replayed.
        </p>
        <details className="text-sm">
          <summary className="cursor-pointer font-semibold">
            Both sides of your own match
          </summary>
          <div className="mt-2 flex flex-col gap-2 text-fd-muted-foreground">
            <p>
              A shared link only shows the side of each player who clicked
              Share. When you're logged in on balatromp.com you can see both
              sides of your own matches, and you can bring them here:
            </p>
            <ol className="list-decimal pl-5">
              <li>
                Logged in on balatromp.com, open{" "}
                {idForHelp ? (
                  <a
                    className="underline"
                    href={`https://balatromp.com/api/proxy/runs/${idForHelp}/replay`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    this match's replay file
                  </a>
                ) : (
                  <code>
                    https://balatromp.com/api/proxy/runs/&lt;match id&gt;/replay
                  </code>
                )}
                .
              </li>
              <li>
                Save the page (Ctrl+S, or Cmd+S on a Mac) as a{" "}
                <code>.json</code> file.
              </li>
              <li>
                Open it here. It's read in your browser and isn't uploaded.
              </li>
            </ol>
            <label className="w-fit cursor-pointer rounded-md border px-3 py-2 font-semibold text-fd-foreground">
              Open a saved replay file…
              <input
                type="file"
                accept=".json,application/json"
                className="sr-only"
                onChange={openFile}
              />
            </label>
          </div>
        </details>
        {loaded.state === "error" && (
          <p className="text-sm text-red-500">{loaded.error}</p>
        )}
        {loaded.state === "done" && (
          <>
            <Legend />
            <Match logs={loaded.logs} />
          </>
        )}
      </div>
    </ArtContext.Provider>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
      {(["held", "locked"] as const).map((r) => (
        <span key={r} className="flex items-center gap-2">
          <span
            className="inline-block size-4 rounded-sm"
            style={{ outline: `3px solid ${COLOUR[r]}`, outlineOffset: -3 }}
          />
          {r === "held"
            ? "Skipped because you had it"
            : "Skipped because it wasn't unlocked yet"}
        </span>
      ))}
      <span className="flex items-center gap-2">
        <span
          className="inline-block size-4 rounded-sm"
          style={{ outline: "3px dashed currentColor", outlineOffset: -3 }}
        />
        Maybe: the replay was out of line with the game there
      </span>
    </div>
  );
}

/** Each blocked card once per reason, in the order it was first blocked. */
function group(hits: BlockHit[]) {
  const out = new Map<
    string,
    { key: string; reason: BlockReason; hits: BlockHit[] }
  >();
  for (const h of hits) {
    const id = `${h.reason}|${h.key}`;
    const g = out.get(id) ?? { key: h.key, reason: h.reason, hits: [] };
    g.hits.push(h);
    out.set(id, g);
  }
  return [...out.values()];
}

const KINDS = [
  ["Jokers", (k: string) => k.startsWith("j_")],
  ["Consumables", (k: string) => k.startsWith("c_")],
  ["Vouchers", (k: string) => k.startsWith("v_")],
] as const;

type PlayerResult = { error: string } | BlockReport | undefined;

/** Every player's replay. The lobby avatars found in one log are tried in the other's. */
function Match({ logs }: { logs: MatchPlayerLog[] }) {
  const results = useMemo((): PlayerResult[] => {
    const read = logs.map((log) =>
      log.events && isReadable(log) ? matchSettings(log.events) : undefined,
    );
    const ready = logs.flatMap((log, i) => {
      const s = read[i];
      return log.events && s?.ok
        ? [{ i, events: log.events, settings: s.settings }]
        : [];
    });
    const reports = findBlocksMatch(ready);
    return logs.map((_, i): PlayerResult => {
      const s = read[i];
      if (!s) return undefined;
      if (!s.ok) return { error: s.error };
      return reports[ready.findIndex((r) => r.i === i)];
    });
  }, [logs]);
  return (
    <>
      {logs.map((log, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: players keep their order
        <Player key={i} log={log} result={results[i]} />
      ))}
    </>
  );
}

function Player({
  log,
  result,
}: {
  log: MatchPlayerLog;
  result: PlayerResult;
}) {
  const [maybes, setMaybes] = useState(true);

  return (
    <section className="flex flex-col gap-3 rounded-xl border p-4">
      <h2 className="text-xl font-bold">{log.name}</h2>
      {!result ? (
        <p className="text-sm text-fd-muted-foreground">
          This log isn't shared: {log.name} has to click Share on the match
          page.
        </p>
      ) : "error" in result ? (
        <p className="text-sm text-red-500">{result.error}</p>
      ) : (
        <Report report={result} maybes={maybes} setMaybes={setMaybes} />
      )}
    </section>
  );
}

function Report({
  report,
  maybes,
  setMaybes,
}: {
  report: BlockReport;
  maybes: boolean;
  setMaybes: (v: boolean) => void;
}) {
  const shown = report.hits.filter((h) => maybes || h.sure);
  const groups = group(shown);
  const a = report.agreement;
  const seen =
    a.shop.checked + a.packs.checked + a.made.checked + a.jokers.checked;
  const matched =
    a.shop.matched + a.packs.matched + a.made.matched + a.jokers.matched;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-fd-muted-foreground">
        Seed {report.settings.seed}, {report.settings.ruleset.name}. The replay
        put {matched} of the {seen} cards the log shows where the game had them
        ({a.shop.matched}/{a.shop.checked} shop buys, {a.packs.matched}/
        {a.packs.checked} pack cards, {a.made.matched}/{a.made.checked} cards
        made by jokers and consumables).
        {report.firstMiss &&
          ` It first lost the thread at ${report.firstMiss}.`}
      </p>
      {report.avatars.length > 0 && (
        <p className="text-sm text-fd-muted-foreground">
          Probably blocked by the lobby avatars, from{" "}
          {report.avatars[0].from > 0 && report.avatars[0].place
            ? report.avatars[0].place
            : "the start of the run"}
          :{" "}
          {report.avatars.map((a, i) => (
            <span key={a.key}>
              {i > 0 && " and "}
              <Name k={a.key} />
            </span>
          ))}
          . In Multiplayer 1.0.5, looking at the lobby info keeps both players'
          avatar jokers out of your own shop from then on. The log doesn't
          record when anyone looked, or the avatars: this is a guess from cards
          that went missing with no other cause, so it can be wrong.
        </p>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={maybes}
          onChange={(e) => setMaybes(e.target.checked)}
        />
        Show maybes
      </label>
      {groups.length === 0 && <p className="text-sm">Nothing was blocked.</p>}
      {KINDS.map(([label, test]) => {
        const list = groups.filter((g) => test(g.key));
        if (list.length === 0) return null;
        return (
          <div key={label} className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">
              {label} ({list.length})
            </h3>
            <div className="flex flex-wrap gap-4 pt-1">
              {list.map((g) => (
                <ItemCard
                  key={`${g.reason}|${g.key}`}
                  itemKey={g.key}
                  ring={{
                    colour: COLOUR[g.reason],
                    dashed: g.hits.every((h) => !h.sure),
                  }}
                  note={g.hits.length > 1 ? `×${g.hits.length}` : undefined}
                  extra={<Where hits={g.hits} reason={g.reason} />}
                />
              ))}
            </div>
          </div>
        );
      })}
      {shown.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer font-semibold">
            Every skipped roll, in order
          </summary>
          <ol className="mt-2 flex flex-col gap-1">
            {shown.map((h, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: a fixed list
              <li key={i} className="flex flex-wrap gap-x-2">
                <span className="text-fd-muted-foreground">{h.place}</span>
                <span>{h.source}:</span>
                <Name k={h.key} />
                <span style={{ color: COLOUR[h.reason] }}>
                  {h.why ?? LABEL[h.reason]}
                </span>
                {!h.sure && (
                  <span className="text-fd-muted-foreground">(maybe)</span>
                )}
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}

function Name({ k }: { k: string }) {
  const art = useContext(ArtContext);
  return <span className="font-medium">{art?.items[k]?.name ?? k}</span>;
}

function Where({ hits, reason }: { hits: BlockHit[]; reason: BlockReason }) {
  const why = hits.find((h) => h.why)?.why;
  return (
    <span className="flex flex-col gap-0.5">
      <span className="font-semibold" style={{ color: COLOUR[reason] }}>
        {why ?? LABEL[reason]}
      </span>
      {hits.slice(0, 6).map((h, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a fixed list
        <span key={i}>
          {h.place} ({h.source}){h.sure ? "" : ", maybe"}
        </span>
      ))}
      {hits.length > 6 && <span>and {hits.length - 6} more</span>}
    </span>
  );
}
