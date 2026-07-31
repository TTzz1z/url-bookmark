import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { getDatabase } from "./client";
import {
  bookmarks,
  bookmarkTags,
  tags,
  type BookmarkRecord,
  type ExtractionStatus,
  type NewBookmarkRecord,
  type TagRecord,
} from "./schema";
import { AppError } from "@/lib/errors";

export type BookmarkWithTags = BookmarkRecord & {
  tags: TagRecord[];
};

export type TagWithCount = TagRecord & {
  bookmarkCount: number;
};

export type BookmarkListOptions = {
  q?: string;
  tagId?: string;
  status?: ExtractionStatus | "";
  sort?: "created" | "updated" | "title";
  page?: number;
  pageSize?: number;
};

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

export function normalizeTagName(name: string): {
  name: string;
  normalizedName: string;
} {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (!trimmed) {
    throw new AppError("VALIDATION_ERROR", "标签名称不能为空");
  }
  if (trimmed.length > 30) {
    throw new AppError("VALIDATION_ERROR", "标签名称不能超过 30 个字符");
  }
  return {
    name: trimmed,
    normalizedName: trimmed.normalize("NFKC").toLocaleLowerCase(),
  };
}

async function tagsForBookmarkIds(
  bookmarkIds: string[],
): Promise<Map<string, TagRecord[]>> {
  const result = new Map<string, TagRecord[]>();
  if (bookmarkIds.length === 0) {
    return result;
  }
  const database = getDatabase();
  const rows = database
    .select({
      bookmarkId: bookmarkTags.bookmarkId,
      tag: tags,
    })
    .from(bookmarkTags)
    .innerJoin(tags, eq(bookmarkTags.tagId, tags.id))
    .where(inArray(bookmarkTags.bookmarkId, bookmarkIds))
    .all();

  for (const row of rows) {
    const list = result.get(row.bookmarkId) ?? [];
    list.push(row.tag);
    result.set(row.bookmarkId, list);
  }
  return result;
}

export async function listBookmarks(
  options: BookmarkListOptions = {},
): Promise<{ items: BookmarkWithTags[]; total: number }> {
  const database = getDatabase();
  const q = options.q?.trim() ?? "";
  const pattern = `%${escapeLike(q)}%`;
  const tagId = options.tagId?.trim() ?? "";
  const status = options.status ?? "";
  const pageSize = Math.min(Math.max(options.pageSize ?? 50, 1), 100);
  const page = Math.max(options.page ?? 1, 1);
  const offset = (page - 1) * pageSize;
  const orderBy =
    options.sort === "title"
      ? "b.title COLLATE NOCASE ASC"
      : options.sort === "updated"
        ? "b.updated_at DESC"
        : "b.created_at DESC";

  const whereSql = `
    WHERE (
      ? = '' OR
      b.title LIKE ? ESCAPE '\\' OR
      b.url LIKE ? ESCAPE '\\' OR
      b.final_url LIKE ? ESCAPE '\\' OR
      b.domain LIKE ? ESCAPE '\\' OR
      b.markdown_content LIKE ? ESCAPE '\\' OR
      b.user_note LIKE ? ESCAPE '\\' OR
      EXISTS (
        SELECT 1
        FROM bookmark_tags bt_search
        JOIN tags t_search ON t_search.id = bt_search.tag_id
        WHERE bt_search.bookmark_id = b.id
          AND t_search.name LIKE ? ESCAPE '\\'
      )
    )
    AND (
      ? = '' OR EXISTS (
        SELECT 1 FROM bookmark_tags bt_filter
        WHERE bt_filter.bookmark_id = b.id
          AND bt_filter.tag_id = ?
      )
    )
    AND (? = '' OR b.extraction_status = ?)
  `;
  const params = [
    q,
    pattern,
    pattern,
    pattern,
    pattern,
    pattern,
    pattern,
    pattern,
    tagId,
    tagId,
    status,
    status,
  ];

  const idRows = database.$client
    .prepare(
      `SELECT b.id FROM bookmarks b ${whereSql}
       ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
    )
    .all(...params, pageSize, offset) as Array<{ id: string }>;
  const totalRow = database.$client
    .prepare(`SELECT COUNT(*) AS total FROM bookmarks b ${whereSql}`)
    .get(...params) as { total: number };

  if (idRows.length === 0) {
    return { items: [], total: totalRow.total };
  }

  const ids = idRows.map((row) => row.id);
  const records = database
    .select()
    .from(bookmarks)
    .where(inArray(bookmarks.id, ids))
    .all();
  const recordMap = new Map(records.map((record) => [record.id, record]));
  const tagMap = await tagsForBookmarkIds(ids);
  const items = ids
    .map((id) => recordMap.get(id))
    .filter((record): record is BookmarkRecord => Boolean(record))
    .map((record) => ({
      ...record,
      tags: tagMap.get(record.id) ?? [],
    }));

  return { items, total: totalRow.total };
}

export async function getBookmarkById(
  id: string,
): Promise<BookmarkWithTags | null> {
  const database = getDatabase();
  const bookmark = database
    .select()
    .from(bookmarks)
    .where(eq(bookmarks.id, id))
    .get();
  if (!bookmark) {
    return null;
  }
  const tagMap = await tagsForBookmarkIds([id]);
  return { ...bookmark, tags: tagMap.get(id) ?? [] };
}

export function findBookmarkByNormalizedUrl(
  normalizedUrl: string,
): BookmarkRecord | null {
  const database = getDatabase();
  return (
    database
      .select()
      .from(bookmarks)
      .where(eq(bookmarks.normalizedUrl, normalizedUrl))
      .get() ?? null
  );
}

export function insertBookmark(values: NewBookmarkRecord): BookmarkRecord {
  const database = getDatabase();
  return database.insert(bookmarks).values(values).returning().get();
}

export function updateBookmarkRecord(
  id: string,
  values: Partial<Omit<NewBookmarkRecord, "id" | "url" | "normalizedUrl">>,
): BookmarkRecord {
  const database = getDatabase();
  const updated = database
    .update(bookmarks)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(bookmarks.id, id))
    .returning()
    .get();
  if (!updated) {
    throw new AppError("NOT_FOUND", undefined, 404);
  }
  return updated;
}

export function deleteBookmark(id: string): boolean {
  const database = getDatabase();
  const result = database.delete(bookmarks).where(eq(bookmarks.id, id)).run();
  return result.changes > 0;
}

export function getOrCreateTag(rawName: string): TagRecord {
  const database = getDatabase();
  const normalized = normalizeTagName(rawName);
  const existing = database
    .select()
    .from(tags)
    .where(eq(tags.normalizedName, normalized.normalizedName))
    .get();
  if (existing) {
    return existing;
  }
  const now = new Date();
  return database
    .insert(tags)
    .values({
      id: randomUUID(),
      ...normalized,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();
}

export function setBookmarkTags(
  bookmarkId: string,
  rawNames: string[],
): TagRecord[] {
  const database = getDatabase();
  const uniqueNames = Array.from(
    new Map(
      rawNames
        .filter((name) => name.trim())
        .map((name) => {
          const normalized = normalizeTagName(name);
          return [normalized.normalizedName, normalized.name] as const;
        }),
    ).values(),
  );
  if (uniqueNames.length > 12) {
    throw new AppError("VALIDATION_ERROR", "每条书签最多添加 12 个标签");
  }

  return database.transaction(() => {
    const selectedTags = uniqueNames.map((name) => getOrCreateTag(name));
    database
      .delete(bookmarkTags)
      .where(eq(bookmarkTags.bookmarkId, bookmarkId))
      .run();
    if (selectedTags.length > 0) {
      database
        .insert(bookmarkTags)
        .values(
          selectedTags.map((tag) => ({
            bookmarkId,
            tagId: tag.id,
            createdAt: new Date(),
          })),
        )
        .run();
    }
    return selectedTags;
  });
}

export function listTags(): TagWithCount[] {
  const database = getDatabase();
  const rows = database.$client
    .prepare(
      `SELECT
        t.id,
        t.name,
        t.normalized_name AS normalizedName,
        t.created_at AS createdAt,
        t.updated_at AS updatedAt,
        COUNT(bt.bookmark_id) AS bookmarkCount
      FROM tags t
      LEFT JOIN bookmark_tags bt ON bt.tag_id = t.id
      GROUP BY t.id
      ORDER BY t.name COLLATE NOCASE ASC`,
    )
    .all() as Array<{
    id: string;
    name: string;
    normalizedName: string;
    createdAt: number;
    updatedAt: number;
    bookmarkCount: number;
  }>;
  return rows.map((row) => ({
    ...row,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  }));
}

export function updateTag(id: string, rawName: string): TagRecord {
  const database = getDatabase();
  const normalized = normalizeTagName(rawName);
  const conflicting = database
    .select()
    .from(tags)
    .where(eq(tags.normalizedName, normalized.normalizedName))
    .get();
  if (conflicting && conflicting.id !== id) {
    throw new AppError("VALIDATION_ERROR", "同名标签已经存在", 409);
  }
  const updated = database
    .update(tags)
    .set({ ...normalized, updatedAt: new Date() })
    .where(and(eq(tags.id, id)))
    .returning()
    .get();
  if (!updated) {
    throw new AppError("NOT_FOUND", "未找到该标签", 404);
  }
  return updated;
}

export function deleteTag(id: string): boolean {
  const database = getDatabase();
  const result = database.delete(tags).where(eq(tags.id, id)).run();
  return result.changes > 0;
}
