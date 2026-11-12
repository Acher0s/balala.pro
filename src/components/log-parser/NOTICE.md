# Log Parser: where it comes from

The files in `bmp/` (except `ui.tsx` and `card-art.ts`) are copied from the Balatro Multiplayer
team's server and website repository,
[Balatro-Multiplayer/BalatroMultiplayerServer](https://github.com/Balatro-Multiplayer/BalatroMultiplayerServer),
as they were in the commit before `f5e5bbf7` ("Remove the Log Parser page and its upload
parsers", 2026-11-03). That repository's website (`apps/web/`) is licensed AGPL-3.0; these files
are used on balala.pro with the BMP team's permission.

| Here | There (`apps/web/src/`) |
| --- | --- |
| `bmp/legacy/*` | `app/(home)/log-parser/_legacy/*` |
| `bmp/idol-track.tsx` | `app/(home)/matches/components/game-log/idol-track.tsx` |
| `bmp/info-tooltip-label.tsx` | `app/(home)/matches/components/info-tooltip-label.tsx` |
| `bmp/idol-geometry.ts`, `bmp/types.ts` | `app/(home)/matches/lib/game-log/` |
| `bmp/card-ref.ts`, `bmp/ruleset-info.ts` | `app/(home)/matches/lib/` |
| `bmp/decks.ts` | `shared/decks.ts` |

Changes made here, each noted at the top of the file:

- Import paths point at the files above, at `ui.tsx` (stand-ins for the BMP site's shadcn
  components and `next/image`) and at `card-art.ts` (stand-in for `@/shared/jokers` and
  `@/shared/vouchers`, filled from this site's game data).
- `legacy/log-source-parser.ts` unzips packed data with `gunzipLimited`, which stops at 32 MB,
  instead of `gunzipSync`, against zip bombs in a log.
- `legacy/deck-view.tsx` reads the sprite sheets from `/game/atlases/` (copied from the game by
  `npm run import-game`), `legacy/legacy-game-view.tsx` uses full picture addresses.
- `legacy/log-source-parser.test.ts` runs on vitest instead of bun:test.

The page around it (`log-parser.tsx`, `parser.worker.ts`, `index.tsx`) is this site's own: files
are read in the browser, in a worker with a time limit, with limits on file count, type and size,
and never uploaded.
