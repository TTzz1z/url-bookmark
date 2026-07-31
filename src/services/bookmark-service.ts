import { randomUUID } from "node:crypto";
import { AppError } from "@/lib/errors";
import {
  findBookmarkByNormalizedUrl,
  getBookmarkById,
  hardDeleteBookmark,
  insertBookmark,
  listBookmarks as listBookmarkRecords,
  listDeletedBookmarkIdsBefore,
  restoreBookmark as restoreBookmarkRecord,
  setBookmarkTags,
  softDeleteBookmark,
  updateBookmarkRecord,
  type BookmarkListOptions,
  type BookmarkWithTags,
} from "@/db/repository";
import { extractUrl, type ExtractionResult } from "./extraction-service";
import { appendChartsToMarkdown } from "./chart-extraction-service";
import {
  localizeBookmarkImages,
  removeBookmarkAssets,
} from "./image-localization-service";
import { normalizeUrl } from "./url-security-service";

/**
 * 删除后保留多久才真正清除。这段时间内 UI 可以撤销，
 * 过期记录在下一次列表查询时顺带清理，不依赖常驻定时器。
 */
export const DELETED_RETENTION_MS = 10 * 60 * 1000;

export type CreateBookmarkInput = {
  url: string;
  tagNames?: string[];
};

export type UpdateBookmarkInput = {
  title?: string;
  userNote?: string;
  markdownContent?: string;
  tagNames?: string[];
};

async function localizeExtractionImages(
  bookmarkId: string,
  result: ExtractionResult,
): Promise<ExtractionResult> {
  try {
    const localized = await localizeBookmarkImages(
      bookmarkId,
      result.markdownContent,
      result.finalUrl,
      result.generatedImages ?? [],
      result.coverImageUrl ? [result.coverImageUrl] : [],
    );
    const markdownContent = appendChartsToMarkdown(
      localized.markdownContent,
      localized.attachedCharts,
    );
    return {
      ...result,
      coverImageUrl: result.coverImageUrl
        ? (localized.localizedUrlByRemote[result.coverImageUrl] ??
          result.coverImageUrl)
        : undefined,
      markdownContent,
      contentLength: markdownContent.length,
      generatedImages: undefined,
    };
  } catch {
    return result;
  }
}

export async function createBookmark(
  input: CreateBookmarkInput,
): Promise<BookmarkWithTags> {
  const normalized = normalizeUrl(input.url);
  const existing = findBookmarkByNormalizedUrl(normalized.normalizedUrl);
  if (existing) {
    if (!existing.deletedAt) {
      throw new AppError("DUPLICATE_URL", undefined, 409);
    }
    // 同一网址此前被删除但仍在撤销窗口内：彻底清除旧记录，
    // 否则 normalized_url 的唯一索引会阻止重新收藏。
    purgeBookmark(existing.id);
  }
  const now = new Date();
  const id = randomUUID();
  insertBookmark({
    id,
    url: normalized.originalUrl,
    normalizedUrl: normalized.normalizedUrl,
    finalUrl: normalized.normalizedUrl,
    title: normalized.domain || normalized.originalUrl,
    domain: normalized.domain,
    extractionStatus: "pending",
    createdAt: now,
    updatedAt: now,
  });
  if (input.tagNames?.length) {
    setBookmarkTags(id, input.tagNames);
  }

  const result = await localizeExtractionImages(
    id,
    await extractUrl(normalized.normalizedUrl),
  );
  updateBookmarkRecord(id, {
    finalUrl: result.finalUrl,
    title: result.title,
    domain: result.domain,
    description: result.description ?? null,
    author: result.author ?? null,
    faviconUrl: result.faviconUrl ?? null,
    coverImageUrl: result.coverImageUrl ?? null,
    markdownContent: result.markdownContent,
    plainText: result.plainText,
    contentLength: result.contentLength,
    extractionStatus: result.status,
    errorCode: result.errorCode ?? null,
    errorMessage: result.errorMessage ?? null,
    httpStatusCode: result.httpStatusCode ?? null,
    extractedAt: new Date(),
  });

  const created = await getBookmarkById(id);
  if (!created) {
    throw new AppError("UNKNOWN_ERROR", "收藏已保存，但无法读取结果", 500);
  }
  return created;
}

export async function updateBookmark(
  id: string,
  input: UpdateBookmarkInput,
): Promise<BookmarkWithTags> {
  const existing = await getBookmarkById(id);
  if (!existing) {
    throw new AppError("NOT_FOUND", undefined, 404);
  }
  const changes: Parameters<typeof updateBookmarkRecord>[1] = {};
  if (input.title !== undefined) {
    const title = input.title.trim();
    if (!title || title.length > 300) {
      throw new AppError(
        "VALIDATION_ERROR",
        "标题不能为空且不能超过 300 个字符",
      );
    }
    changes.title = title;
  }
  if (input.userNote !== undefined) {
    if (input.userNote.length > 5_000) {
      throw new AppError("VALIDATION_ERROR", "备注不能超过 5000 个字符");
    }
    changes.userNote = input.userNote;
  }
  if (
    input.markdownContent !== undefined &&
    input.markdownContent !== existing.markdownContent
  ) {
    if (input.markdownContent.length > 2 * 1024 * 1024) {
      throw new AppError("VALIDATION_ERROR", "Markdown 不能超过 2 MB");
    }
    changes.markdownContent = input.markdownContent;
    changes.plainText = input.markdownContent
      .replace(/[#>*_`~\[\]()!-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    changes.contentLength = input.markdownContent.length;
    changes.isContentEdited = true;
  }
  if (Object.keys(changes).length > 0) {
    updateBookmarkRecord(id, changes);
  }
  if (input.tagNames !== undefined) {
    setBookmarkTags(id, input.tagNames);
  }
  const updated = await getBookmarkById(id);
  if (!updated) {
    throw new AppError("NOT_FOUND", undefined, 404);
  }
  return updated;
}

export async function reExtractBookmark(
  id: string,
  overwriteEditedContent: boolean,
): Promise<BookmarkWithTags> {
  const existing = await getBookmarkById(id);
  if (!existing) {
    throw new AppError("NOT_FOUND", undefined, 404);
  }
  if (existing.isContentEdited && !overwriteEditedContent) {
    throw new AppError("CONTENT_EDITED", undefined, 409);
  }

  updateBookmarkRecord(id, {
    extractionStatus: "pending",
    errorCode: null,
    errorMessage: null,
    retryCount: existing.retryCount + 1,
  });
  let result = await extractUrl(existing.normalizedUrl);
  const shouldKeepExistingContent =
    result.status === "failed" ||
    (existing.isContentEdited && result.status !== "success");
  if (!shouldKeepExistingContent) {
    result = await localizeExtractionImages(id, result);
  }
  updateBookmarkRecord(id, {
    finalUrl: result.finalUrl,
    title:
      result.status === "success" && result.title
        ? result.title
        : existing.title,
    domain: result.domain || existing.domain,
    description: result.description ?? existing.description,
    author: result.author ?? existing.author,
    faviconUrl: result.faviconUrl ?? existing.faviconUrl,
    coverImageUrl:
      result.status === "success"
        ? (result.coverImageUrl ?? null)
        : (result.coverImageUrl ?? existing.coverImageUrl),
    markdownContent: shouldKeepExistingContent
      ? existing.markdownContent
      : result.markdownContent,
    plainText: shouldKeepExistingContent
      ? existing.plainText
      : result.plainText,
    contentLength: shouldKeepExistingContent
      ? existing.contentLength
      : result.contentLength,
    isContentEdited: shouldKeepExistingContent && existing.isContentEdited,
    extractionStatus: result.status,
    errorCode: result.errorCode ?? null,
    errorMessage: result.errorMessage ?? null,
    httpStatusCode: result.httpStatusCode ?? null,
    extractedAt: new Date(),
  });
  const updated = await getBookmarkById(id);
  if (!updated) {
    throw new AppError("NOT_FOUND", undefined, 404);
  }
  return updated;
}

/**
 * 标记删除。正文、标签关联与本地图片都会保留到撤销窗口结束，
 * 因此这里不能清理磁盘资源。
 */
export function deleteBookmark(id: string): boolean {
  return softDeleteBookmark(id);
}

export async function restoreBookmark(
  id: string,
): Promise<BookmarkWithTags | null> {
  if (!restoreBookmarkRecord(id)) {
    return null;
  }
  return getBookmarkById(id);
}

export function purgeBookmark(id: string): boolean {
  const purged = hardDeleteBookmark(id);
  if (purged) {
    removeBookmarkAssets(id);
  }
  return purged;
}

export function purgeExpiredBookmarks(
  now: Date = new Date(),
  retentionMs: number = DELETED_RETENTION_MS,
): number {
  const expiredIds = listDeletedBookmarkIdsBefore(
    new Date(now.getTime() - retentionMs),
  );
  let purged = 0;
  for (const expiredId of expiredIds) {
    if (purgeBookmark(expiredId)) {
      purged += 1;
    }
  }
  return purged;
}

export async function listBookmarks(
  options: BookmarkListOptions = {},
): Promise<{ items: BookmarkWithTags[]; total: number }> {
  purgeExpiredBookmarks();
  return listBookmarkRecords(options);
}

export { getBookmarkById, type BookmarkListOptions };
