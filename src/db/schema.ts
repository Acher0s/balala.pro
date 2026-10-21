import {
  type AnyPgColumn,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/** "none" = signed in but not (yet) an author. "writer" = author (shown as "Author"): edits their own guides. Admins edit everything. */
export type Role = "none" | "writer" | "admin";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  discordId: text("discord_id").notNull().unique(),
  username: text("username").notNull(),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  role: text("role").$type<Role>().notNull().default("none"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const sessions = pgTable(
  "sessions",
  {
    /** SHA-256 of the cookie token, so a database leak doesn't leak live sessions. */
    tokenHash: text("token_hash").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export type RequestStatus = "pending" | "approved" | "denied";

export const writerRequests = pgTable(
  "writer_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    message: text("message").notNull(),
    status: text("status").$type<RequestStatus>().notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decidedBy: uuid("decided_by").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (t) => [index("writer_requests_status_idx").on(t.status)],
);

/** Guides explain; tools are mainly calculators. Both are written and published the same way. */
export type PageKind = "guide" | "tool";

export const guides = pgTable(
  "guides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").$type<PageKind>().notNull().default("guide"),
    /** Unique across guides and tools, so <Tool id="…"> and URLs never clash. */
    slug: text("slug").notNull(),
    authorId: uuid("author_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /** Sidebar group, e.g. "Jokers". Empty = top level. Ignored for parts of another guide. */
    section: text("section").notNull().default(""),
    /** Order within the section, or among the parts of the parent guide. */
    position: integer("position").notNull().default(0),
    /**
     * The main guide this one is a part of (e.g. "Core principles" of the White Stake guide).
     * Parts aren't listed on their own; readers reach them from the main guide. One level only.
     */
    parentId: uuid("parent_id").references((): AnyPgColumn => guides.id, {
      onDelete: "set null",
    }),
    /** The working copy: MDX with frontmatter. Autosaved by the editor, never shown publicly. */
    draftSource: text("draft_source").notNull(),
    /** What the public site shows. Null until first published. */
    publishedSource: text("published_source"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("guides_slug_idx").on(t.slug),
    index("guides_parent_idx").on(t.parentId),
  ],
);

/** Every published version, for history and rollback. */
export const guideRevisions = pgTable(
  "guide_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    guideId: uuid("guide_id")
      .notNull()
      .references(() => guides.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    publishedBy: uuid("published_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("guide_revisions_guide_idx").on(t.guideId)],
);

/** Site-wide settings editable by admins (home page text, …). */
export const siteSettings = pgTable("site_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
});

/** Admin edits to imported card data, e.g. BMP balance changes. */
export const cardOverrides = pgTable(
  "card_overrides",
  {
    kind: text("kind").notNull(),
    itemId: text("item_id").notNull(),
    data: jsonb("data").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("card_overrides_pk").on(t.kind, t.itemId)],
);

export type User = typeof users.$inferSelect;
export type Guide = typeof guides.$inferSelect;

export type TierListStatus = "private" | "published";

/** Tier lists anyone signed in can make; published ones are public and embeddable. */
export const tierLists = pgTable(
  "tier_lists",
  {
    /** Short random id used in URLs and <TierList id="…">. */
    id: text("id").primaryKey(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    /** TierListData: tiers with their item refs, plus the unranked pool. */
    data: jsonb("data").notNull(),
    status: text("status").$type<TierListStatus>().notNull().default("private"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (t) => [
    index("tier_lists_owner_idx").on(t.ownerId),
    index("tier_lists_status_idx").on(t.status),
  ],
);

export type TierListRow = typeof tierLists.$inferSelect;

const bytea = customType<{ data: Uint8Array; driverData: Uint8Array }>({
  dataType: () => "bytea",
});

/** Images and GIFs uploaded by authors, served at /media/<id>. */
export const media = pgTable("media", {
  id: text("id").primaryKey(),
  ownerId: uuid("owner_id").references(() => users.id, {
    onDelete: "set null",
  }),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  bytes: bytea("bytes").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
