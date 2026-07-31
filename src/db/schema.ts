import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const extractionStatuses = [
  "pending",
  "success",
  "partial",
  "failed",
] as const;

export type ExtractionStatus = (typeof extractionStatuses)[number];

export const bookmarks = sqliteTable(
  "bookmarks",
  {
    id: text("id").primaryKey(),
    url: text("url").notNull(),
    normalizedUrl: text("normalized_url").notNull(),
    finalUrl: text("final_url").notNull(),
    title: text("title").notNull(),
    domain: text("domain").notNull(),
    description: text("description"),
    author: text("author"),
    faviconUrl: text("favicon_url"),
    coverImageUrl: text("cover_image_url"),
    markdownContent: text("markdown_content").notNull().default(""),
    plainText: text("plain_text").notNull().default(""),
    userNote: text("user_note").notNull().default(""),
    extractionStatus: text("extraction_status", {
      enum: extractionStatuses,
    })
      .notNull()
      .default("pending"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    httpStatusCode: integer("http_status_code"),
    contentLength: integer("content_length").notNull().default(0),
    isContentEdited: integer("is_content_edited", { mode: "boolean" })
      .notNull()
      .default(false),
    retryCount: integer("retry_count").notNull().default(0),
    extractedAt: integer("extracted_at", { mode: "timestamp_ms" }),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("bookmarks_normalized_url_unique").on(table.normalizedUrl),
    index("bookmarks_created_at_idx").on(table.createdAt),
    index("bookmarks_updated_at_idx").on(table.updatedAt),
    index("bookmarks_status_idx").on(table.extractionStatus),
    index("bookmarks_domain_idx").on(table.domain),
    index("bookmarks_deleted_at_idx").on(table.deletedAt),
  ],
);

export const tags = sqliteTable(
  "tags",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("tags_normalized_name_unique").on(table.normalizedName),
  ],
);

export const bookmarkTags = sqliteTable(
  "bookmark_tags",
  {
    bookmarkId: text("bookmark_id")
      .notNull()
      .references(() => bookmarks.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    primaryKey({ columns: [table.bookmarkId, table.tagId] }),
    index("bookmark_tags_tag_idx").on(table.tagId),
  ],
);

export type BookmarkRecord = typeof bookmarks.$inferSelect;
export type NewBookmarkRecord = typeof bookmarks.$inferInsert;
export type TagRecord = typeof tags.$inferSelect;
