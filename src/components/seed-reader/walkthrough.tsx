"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  type ChangeEvent,
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  findBlocksMatch,
  type MatchPlayerLog,
  matchSettings,
  type PassedBy,
  type ReplayStep,
  replaySteps,
} from "@/lib/seed/blocks";
import {
  browserGunzip,
  isReadable,
  type ReplayResponse,
  readReplay,
} from "@/lib/seed/replay-file";
import { ItemCard, useArt } from "./seed-card";

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** A player's log, replayed: the steps the walkthrough goes through. */
export interface LateLog {
  name: string;
  steps: ReplayStep[];
}

/** Every readable log of a match, replayed (the lobby avatars found across the match). */
function replayMatch(logs: MatchPlayerLog[]): LateLog[] {
  const ready = logs.flatMap((log) => {
    if (!log.events || !isReadable(log)) return [];
    const read = matchSettings(log.events);
    return read.ok
      ? [{ name: log.name, events: log.events, settings: read.settings }]
      : [];
  });
  const reports = findBlocksMatch(ready);
  return ready.map((l, i) => ({
    name: l.name,
    steps: replaySteps(l.events, l.settings, reports[i]?.avatars ?? []),
  }));
}

/**
 * Loads a match (a shared link, or a replay file saved while logged in) and replays its logs,
 * for the seed reader to read on from any step of one of them.
 */
export function LogLoader({
  onLoad,
}: {
  onLoad: (logs: LateLog[], match?: string) => void;
}) {
  const [input, setInput] = useState("");
  const [state, setState] = useState<{ loading?: boolean; error?: string }>({});

  const done = (logs: MatchPlayerLog[], match?: string) => {
    const replayed = replayMatch(logs);
    if (!replayed.length) {
      setState({
        error:
          "No log in that match can be read: it has to be shared, and played with The Order on 1.0.5 or later.",
      });
      return;
    }
    setState({});
    onLoad(replayed, match);
  };

  const load = async (id: string) => {
    setState({ loading: true });
    try {
      const res = await fetch(`/api/what-did-i-block/${id}`);
      const body = await res.json();
      if (!res.ok) setState({ error: body.error ?? "That didn't work." });
      else done(body.logs, id);
    } catch {
      setState({ error: "The match couldn't be loaded." });
    }
  };

  // A link can carry the match: /seed-reader?match=<id>.
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, on load
  useEffect(() => {
    const id = UUID.exec(
      new URLSearchParams(window.location.search).get("match") ?? "",
    )?.[0];
    if (id) {
      setInput(`https://balatromp.com/matches/${id}`);
      load(id.toLowerCase());
    }
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const id = UUID.exec(input.trim())?.[0];
    if (!id) {
      setState({
        error: "Paste a match link, like https://balatromp.com/matches/…",
      });
      return;
    }
    load(id.toLowerCase());
  };

  const openFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setState({ loading: true });
    try {
      const data = JSON.parse(await file.text()) as ReplayResponse;
      if (!Array.isArray(data.logs)) throw new Error("no logs");
      const { logs } = await readReplay(data, browserGunzip);
      done(logs);
    } catch {
      setState({ error: "That file isn't a match replay." });
    }
  };

  return (
    <details className="rounded-xl border bg-fd-card p-3 text-sm">
      <summary className="cursor-pointer font-semibold">
        Read on from a match log
      </summary>
      <div className="mt-2 flex flex-col gap-2">
        <p className="text-fd-muted-foreground">
          Replays a match log through the reader, so you can step through it,
          see what each roll passed by and why, and read every queue on from any
          point of the run.
        </p>
        <form onSubmit={submit} className="flex flex-wrap gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="https://balatromp.com/matches/…"
            aria-label="Match link"
            className="min-w-0 flex-1 rounded-md border bg-fd-background px-3 py-2"
          />
          <button
            type="submit"
            disabled={state.loading}
            className="rounded-md bg-fd-primary px-4 py-2 font-semibold text-fd-primary-foreground disabled:opacity-50"
          >
            {state.loading ? "Loading…" : "Load log"}
          </button>
          <label className="cursor-pointer rounded-md border px-3 py-2 font-semibold">
            Open a replay file…
            <input
              type="file"
              accept=".json,application/json"
              className="sr-only"
              onChange={openFile}
            />
          </label>
        </form>
        {state.error && <p className="text-red-500">{state.error}</p>}
      </div>
    </details>
  );
}

const VERB: Record<string, string> = {
  select_blind: "Played",
  skip_blind: "Skipped",
  cashout: "Cashed out",
  reroll: "Rerolled the shop",
  leave_shop: "Left the shop",
  buy: "Bought",
  open_pack: "Opened",
  pack_pick: "Picked",
  pack_skip: "Skipped the pack",
  use: "Used",
  sell: "Sold",
  play: "Played a hand",
  discard: "Discarded",
};

export const PASSED_COLOUR: Record<PassedBy, string> = {
  held: "#ff9a00",
  "on screen": "#9b59b6",
  "in use": "#e67e22",
  avatar: "#fe5f55",
  locked: "#009dff",
};
const PASSED_LABEL: Record<PassedBy, string> = {
  held: "You had it",
  "on screen": "On screen",
  "in use": "Being used",
  avatar: "Lobby avatar",
  locked: "Not unlocked",
};

function useName() {
  const art = useArt();
  return (k: string) => art.items[k]?.name ?? k;
}

function stepTitle(step: ReplayStep, name: (k: string) => string): string {
  const verb = VERB[step.op] ?? step.op;
  if (step.op === "select_blind" || step.op === "skip_blind")
    return `${verb} the ${step.place.split(" · ").pop()}`;
  const keys = step.keys.map(name);
  return keys.length ? `${verb} ${keys.join(", ")}` : verb;
}

/** Steps that start a shop, for jumping from shop to shop. */
const isShopStart = (s: ReplayStep) => s.op === "cashout";

/**
 * The log step by step: what each event rolled, the cards those rolls passed by and what kept
 * each one out, and where the replay checked itself against the log. The seed reader reads on
 * from the chosen step.
 */
export function Walkthrough({
  logs,
  player,
  setPlayer,
  index,
  setIndex,
  onExit,
}: {
  logs: LateLog[];
  player: number;
  setPlayer: (i: number) => void;
  index: number;
  setIndex: (i: number) => void;
  onExit: () => void;
}) {
  const name = useName();
  const steps = logs[player]?.steps ?? [];
  const step = steps[index];
  const listRef = useRef<HTMLOListElement>(null);
  const last = steps.length - 1;
  const go = (i: number) => setIndex(Math.max(-1, Math.min(last, i)));
  const shopStarts = useMemo(
    () => steps.flatMap((s, i) => (isShopStart(s) ? [i] : [])),
    [steps],
  );

  // Keep the chosen step in view in the list.
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-step="${index}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [index]);

  // ← and → step through the log (not while typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return;
      if (e.key === "ArrowRight") go(index + 1);
      else if (e.key === "ArrowLeft") go(index - 1);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const missesBefore = steps
    .slice(0, index + 1)
    .some((s) => s.checks.some((c) => !c.ok));

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-fd-card p-4 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-semibold">Walking through</span>
        {logs.length > 1 ? (
          <select
            value={player}
            onChange={(e) => setPlayer(Number(e.target.value))}
            className="rounded-lg border bg-fd-background px-2 py-1"
          >
            {logs.map((l, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: players keep their order
              <option key={i} value={i}>
                {l.name}
              </option>
            ))}
          </select>
        ) : (
          <span>{logs[0]?.name}</span>
        )}
        <span className="text-fd-muted-foreground">
          seed {step?.settings.seed ?? steps[0]?.settings.seed}
        </span>
        <button
          type="button"
          onClick={onExit}
          className="ml-auto flex items-center gap-1 rounded-md border px-2 py-1 hover:bg-fd-accent"
        >
          <X className="size-4" /> Back to reading from the start
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() =>
            go([...shopStarts].reverse().find((i) => i < index) ?? -1)
          }
          className="rounded-md border px-2 py-1 hover:bg-fd-accent"
        >
          « Shop
        </button>
        <button
          type="button"
          aria-label="Previous step"
          onClick={() => go(index - 1)}
          className="rounded-md border p-1 hover:bg-fd-accent"
        >
          <ChevronLeft className="size-4" />
        </button>
        <input
          type="range"
          min={-1}
          max={last}
          value={index}
          onChange={(e) => go(Number(e.target.value))}
          aria-label="Step"
          className="min-w-40 flex-1"
        />
        <button
          type="button"
          aria-label="Next step"
          onClick={() => go(index + 1)}
          className="rounded-md border p-1 hover:bg-fd-accent"
        >
          <ChevronRight className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => go(shopStarts.find((i) => i > index) ?? last)}
          className="rounded-md border px-2 py-1 hover:bg-fd-accent"
        >
          Shop »
        </button>
        <span className="font-mono text-xs text-fd-muted-foreground">
          {index + 1}/{steps.length}
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
        <ol
          ref={listRef}
          className="flex max-h-[28rem] flex-col overflow-y-auto rounded-lg border"
        >
          <li data-step={-1}>
            <button
              type="button"
              onClick={() => go(-1)}
              className={`w-full px-2 py-1 text-left ${index === -1 ? "bg-fd-primary text-fd-primary-foreground" : "hover:bg-fd-accent"}`}
            >
              Start of the run
            </button>
          </li>
          {steps.map((s, i) => {
            const miss = s.checks.some((c) => !c.ok);
            const passed = s.rolls.reduce((n, r) => n + r.passed.length, 0);
            const head = i === 0 || steps[i - 1].place !== s.place;
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: a fixed list
              <li key={i} data-step={i}>
                {head && (
                  <div className="sticky top-0 bg-fd-muted px-2 py-0.5 text-xs font-semibold text-fd-muted-foreground">
                    {s.place}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => go(i)}
                  className={`flex w-full items-baseline gap-2 px-2 py-1 text-left ${i === index ? "bg-fd-primary text-fd-primary-foreground" : "hover:bg-fd-accent"}`}
                >
                  <span className="flex-1">{stepTitle(s, name)}</span>
                  {passed > 0 && (
                    <span
                      className="text-xs opacity-80"
                      title="Cards its rolls passed by"
                    >
                      {passed} passed
                    </span>
                  )}
                  {miss && (
                    <span
                      className="text-xs font-bold text-red-500"
                      title="The log showed a card the replay didn't have here"
                    >
                      miss
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ol>

        <div className="flex flex-col gap-3">
          {!step ? (
            <p className="text-fd-muted-foreground">
              The reader below shows the seed from its first roll. Step into the
              log to read on from any point of it.
            </p>
          ) : (
            <StepDetail step={step} name={name} />
          )}
          {missesBefore && (
            <p className="rounded-lg border border-red-500/40 bg-red-500/10 p-2 text-xs">
              The replay lost the thread with the game at least once by here (a
              step marked "miss"), so what the reader shows from this point on
              may be off.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function StepDetail({
  step,
  name,
}: {
  step: ReplayStep;
  name: (k: string) => string;
}) {
  const start = step.settings.start;
  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="text-base font-semibold">{stepTitle(step, name)}</div>
        <div className="text-xs text-fd-muted-foreground">
          {step.place} · ${step.dollars}
        </div>
      </div>
      {step.rolls.length === 0 ? (
        <p className="text-fd-muted-foreground">Nothing rolled.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {step.rolls.map((r, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: rolls are positional
              key={i}
              className="flex flex-wrap items-start gap-3 rounded-lg border p-2"
            >
              <div className="flex w-28 flex-col gap-1 text-xs">
                <span className="font-semibold">{r.source}</span>
                <span className="text-fd-muted-foreground">rolled</span>
              </div>
              {r.got ? (
                r.got.startsWith("j_") ||
                r.got.startsWith("c_") ||
                r.got.startsWith("p_") ? (
                  <ItemCard itemKey={r.got} />
                ) : (
                  <span className="self-center">{r.got}</span>
                )
              ) : (
                <span className="self-center text-fd-muted-foreground">—</span>
              )}
              {r.passed.length > 0 && (
                <>
                  <span className="self-center text-xs text-fd-muted-foreground">
                    after passing by
                  </span>
                  {r.passed.map((p, j) => (
                    <ItemCard
                      // biome-ignore lint/suspicious/noArrayIndexKey: passes are positional
                      key={j}
                      itemKey={p.key}
                      ring={{ colour: PASSED_COLOUR[p.by] }}
                      note={
                        <span style={{ color: PASSED_COLOUR[p.by] }}>
                          {PASSED_LABEL[p.by]}
                        </span>
                      }
                      extra={p.why ?? PASSED_LABEL[p.by]}
                    />
                  ))}
                </>
              )}
            </div>
          ))}
        </div>
      )}
      {step.checks.length > 0 && (
        <p className="text-xs">
          Checked against the log:{" "}
          {step.checks.map((c, i) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: a fixed list
              key={i}
              className={c.ok ? "text-green-600" : "font-bold text-red-500"}
            >
              {i > 0 && ", "}
              {c.family} {c.ok ? "✓" : "✗"}
            </span>
          ))}
        </p>
      )}
      {start && (
        <p className="text-xs text-fd-muted-foreground">
          Reading on from here, the reader skips what exists at this point:{" "}
          {start.owned.length ? start.owned.map(name).join(", ") : "nothing"}.
          The shop on screen isn't counted, as rerolling replaces it.
        </p>
      )}
    </div>
  );
}
