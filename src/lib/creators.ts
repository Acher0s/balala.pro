import "server-only";
import { asc } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { CreatorLink } from "@/db/schema";
import { twitchProfileImages } from "@/lib/twitch";

export async function listCreators() {
  const db = await getDb();
  return db
    .select()
    .from(schema.creators)
    .orderBy(asc(schema.creators.position), asc(schema.creators.createdAt));
}

/** A creator as the public page shows them, with their picture worked out. */
export interface PublicCreator {
  id: string;
  name: string;
  twitch: string | null;
  bio: string;
  image: string | null;
  links: CreatorLink[];
}

/** Everyone on the Creators page, with their own picture or else their Twitch one. */
export async function publicCreators(): Promise<PublicCreator[]> {
  const rows = await listCreators();
  const images = await twitchProfileImages(
    rows.flatMap((c) => (c.twitch && !c.avatarUrl ? [c.twitch] : [])),
  );
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    twitch: c.twitch,
    bio: c.bio,
    image:
      c.avatarUrl ??
      (c.twitch ? (images[c.twitch.toLowerCase()] ?? null) : null),
    links: c.links,
  }));
}
