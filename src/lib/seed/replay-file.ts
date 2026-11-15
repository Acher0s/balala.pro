/**
 * balatromp.com's replay JSON (`/api/proxy/runs/<id>/replay`): the run and one gzipped,
 * base64 event list per player. Shared by the server route (node's zlib) and the page, which
 * reads a file the player saved themselves (the browser's DecompressionStream).
 */

import type { LogEvent, MatchPlayerLog } from "./blocks";

export interface ReplayResponse {
  run?: { status?: string };
  logs?: {
    displayName?: string;
    shared?: boolean;
    compressedEvents?: string | null;
    /** Already unpacked: a file this site wrote. */
    events?: LogEvent[] | null;
  }[];
}

/** Each player's events; null where the file doesn't carry them. */
export async function readReplay(
  data: ReplayResponse,
  gunzip: (bytes: Uint8Array) => Promise<string>,
): Promise<{ status: string; logs: MatchPlayerLog[] }> {
  const logs = await Promise.all(
    (data.logs ?? []).map(async (l): Promise<MatchPlayerLog> => {
      let events: LogEvent[] | null = l.events ?? null;
      if (!events && l.compressedEvents)
        try {
          events = JSON.parse(await gunzip(fromBase64(l.compressedEvents)));
        } catch {
          events = null;
        }
      return {
        name: l.displayName ?? "Player",
        shared: l.shared ?? false,
        events,
      };
    }),
  );
  return { status: data.run?.status ?? "unknown", logs };
}

/**
 * Whether a log can be replayed. A log that isn't shared still comes back to anyone, cut down
 * to the blinds it played (no run_info, no shop): only its owner, logged in, gets all of it.
 */
export function isReadable(log: MatchPlayerLog): boolean {
  return log.events?.some((e) => e[1] === "run_info") ?? false;
}

function fromBase64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** The browser's gunzip. */
export async function browserGunzip(bytes: Uint8Array): Promise<string> {
  const stream = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}
