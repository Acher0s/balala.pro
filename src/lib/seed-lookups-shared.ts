import { z } from "zod";

/** What the seed reader reports for each seed it reads (POST /api/seed-reader/report). */
export const seedLookupInput = z.object({
  seed: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^\*?[A-Z0-9]{1,16}$/, "Not a seed"),
  ruleset: z.string().regex(/^[a-z0-9_-]{1,32}$/),
  stake: z.number().int().min(1).max(20),
  deck: z
    .string()
    .regex(/^[a-z0-9_-]{1,32}$/)
    .nullish(),
  patch: z.string().regex(/^[a-z0-9._-]{1,32}$/),
  clientId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
});

export type SeedLookupInput = z.infer<typeof seedLookupInput>;

/** A seed counts as "being read now" when it was looked up this recently. */
export const ACTIVE_MINUTES = 15;

/** The API's scopes, with what each one allows (shown when making a key). */
export const API_SCOPES = {
  "seed-reader:read":
    "Read which seeds the seed reader is reading, and its history",
} as const;
