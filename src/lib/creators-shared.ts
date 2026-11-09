import { z } from "zod";

const webUrl = z
  .string()
  .trim()
  .max(300)
  .refine((u) => /^https?:\/\/\S+$/i.test(u), "Links must start with https://");

/** What an admin fills in for a creator (Studio → Creators). */
export const creatorInputSchema = z.object({
  name: z.string().trim().min(1, "Give the creator a name").max(60),
  /** Twitch login: what comes after twitch.tv/. */
  twitch: z
    .string()
    .trim()
    .transform((t) =>
      t.replace(/^https?:\/\/(www\.)?twitch\.tv\//i, "").replace(/\/.*$/, ""),
    )
    .refine(
      (t) => t === "" || /^[a-zA-Z0-9_]{3,25}$/.test(t),
      "That isn't a Twitch name: use what comes after twitch.tv/",
    ),
  bio: z.string().trim().max(300),
  avatarUrl: z.union([z.literal(""), webUrl]),
  links: z
    .array(
      z.object({
        label: z.string().trim().min(1, "Every link needs a label").max(30),
        url: webUrl,
      }),
    )
    .max(8),
});

export type CreatorInput = z.input<typeof creatorInputSchema>;
