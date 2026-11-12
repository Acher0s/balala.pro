"use client";

import { Upload } from "lucide-react";
import { useRef, useState } from "react";
import { type CardArtTables, setCardArt } from "./bmp/card-art";
import { LegacyGamesView } from "./bmp/legacy/legacy-game-view";
import type { ParsedLogGame } from "./bmp/legacy/log-source-parser";
import type { ParseResponse } from "./parser.worker";

/** Limits, so a mistaken or hostile upload can't swamp the browser. */
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MAX_FILES = 10;
const MAX_TOTAL_BYTES = 100 * 1024 * 1024;
/** Parsing that takes longer than this is stopped. */
const TIMEOUT_MS = 30_000;
const ACCEPTED = /\.(log|txt)$/i;

const megabytes = (bytes: number) => `${Math.round(bytes / 1024 / 1024)} MB`;

/** What's wrong with a set of files, or null if they can be parsed. */
function checkFiles(files: File[]): string | null {
  if (files.length === 0) return "Pick a log file first.";
  if (files.length > MAX_FILES)
    return `That's ${files.length} files; parse at most ${MAX_FILES} at a time.`;
  const wrong = files.find((f) => !ACCEPTED.test(f.name));
  if (wrong)
    return `${wrong.name} isn't a log: pick the .log (or .txt) files from your Lovely logs folder.`;
  const big = files.find((f) => f.size > MAX_FILE_BYTES);
  if (big)
    return `${big.name} is too large (${megabytes(big.size)}; the limit is ${megabytes(MAX_FILE_BYTES)}).`;
  const total = files.reduce((sum, f) => sum + f.size, 0);
  if (total > MAX_TOTAL_BYTES)
    return `Those files are ${megabytes(total)} together; the limit is ${megabytes(MAX_TOTAL_BYTES)}.`;
  return null;
}

/**
 * The 0.5.x Log Parser: pick or drop Lovely log files and see each multiplayer game in them.
 * Files are read and parsed in the browser, in a worker that's stopped if it runs too long, and
 * are never uploaded anywhere. The parser and its views are the BMP site's (see ./NOTICE.md).
 */
export function LogParser({ art }: { art: CardArtTables }) {
  setCardArt(art);
  const [games, setGames] = useState<ParsedLogGame[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  function parse(list: FileList | null) {
    const files = Array.from(list ?? []);
    setError(null);
    setNote(null);
    const problem = checkFiles(files);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    const worker = new Worker(new URL("./parser.worker.ts", import.meta.url), {
      type: "module",
    });
    const stop = (message?: string) => {
      window.clearTimeout(timer);
      worker.terminate();
      setBusy(false);
      if (message) setError(message);
      if (input.current) input.current.value = "";
    };
    const timer = window.setTimeout(
      () =>
        stop(
          "Parsing took too long and was stopped. Try one log at a time, or a smaller log.",
        ),
      TIMEOUT_MS,
    );
    worker.onmessage = (event: MessageEvent<ParseResponse>) => {
      const { games: found, empty } = event.data;
      stop();
      setGames(found.map((g, i) => ({ ...g, id: i + 1 })));
      if (found.length === 0)
        setError(
          "No 0.5.x multiplayer games found in that log. This parser reads logs from the 0.5.x mod (up to 0.5.5).",
        );
      else if (empty.length > 0)
        setNote(`No games found in: ${empty.join(", ")}.`);
    };
    worker.onerror = () =>
      stop("That log couldn't be read. Is it a Lovely log from the game?");
    worker.postMessage({ files, art });
  }

  return (
    <div className="not-prose my-6 flex flex-col gap-4">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!busy) parse(e.dataTransfer.files);
        }}
        className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
          dragging
            ? "border-fd-primary bg-fd-primary/5"
            : "hover:bg-fd-accent/50"
        } ${busy ? "pointer-events-none opacity-60" : ""}`}
      >
        <Upload aria-hidden className="size-6 text-fd-muted-foreground" />
        <span className="font-medium">
          {busy
            ? "Reading your logs…"
            : "Drop log files here, or click to pick them"}
        </span>
        <span className="text-xs text-fd-muted-foreground">
          .log or .txt, up to {MAX_FILES} files of {megabytes(MAX_FILE_BYTES)}.
          Your files are read in your browser and never uploaded.
        </span>
        <input
          ref={input}
          type="file"
          multiple
          accept=".log,.txt,text/plain"
          className="sr-only"
          disabled={busy}
          onChange={(e) => parse(e.target.files)}
        />
      </label>
      {error && <p className="text-sm text-red-500">{error}</p>}
      {note && <p className="text-sm text-fd-muted-foreground">{note}</p>}
      {games.length > 0 && <LegacyGamesView games={games} />}
    </div>
  );
}
