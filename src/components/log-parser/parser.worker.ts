/// <reference lib="webworker" />
/**
 * Reads and parses log files off the page's main thread, so a huge or broken file can't freeze
 * the page; the page stops this worker if it takes too long (see log-parser.tsx). Nothing here
 * talks to the network: files are only read and parsed.
 */
import { type CardArtTables, setCardArt } from "./bmp/card-art";
import {
  type ParsedLogGame,
  parseLogSource,
} from "./bmp/legacy/log-source-parser";

export interface ParseRequest {
  files: File[];
  art: CardArtTables;
}

export interface ParseResponse {
  games: ParsedLogGame[];
  /** Files that held no 0.5.x games or couldn't be read. */
  empty: string[];
}

self.onmessage = async (event: MessageEvent<ParseRequest>) => {
  const { files, art } = event.data;
  setCardArt(art);
  const games: ParsedLogGame[] = [];
  const empty: string[] = [];
  for (const file of files) {
    try {
      const found = await parseLogSource(await file.text());
      if (found.length === 0) empty.push(file.name);
      games.push(...found);
    } catch {
      empty.push(file.name);
    }
  }
  self.postMessage({ games, empty } satisfies ParseResponse);
};
