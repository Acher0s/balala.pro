import { seedArt } from "@/components/seed-reader";
import { BlockCheck as BlockCheckClient } from "./block-check";

/** "What did I block?" (its own page, /what-did-i-block). The replay runs in the browser. */
export function BlockCheck() {
  return <BlockCheckClient art={seedArt()} />;
}
