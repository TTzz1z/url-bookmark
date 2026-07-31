import { randomUUID } from "node:crypto";
import { AppError } from "@/lib/errors";
import {
  deleteBookmark as deleteBookmarkRecord,
  findBookmarkByNormalizedUrl,
  getBookmarkById,
  insertBookmark,
  listBookmarks,
  setBookmarkTags,
  updateBookmarkRecord,
  type BookmarkListOptions,
  type BookmarkWithTags,
} from "@/db/repository";
import { extractUrl, type ExtractionResult } from "./extraction-service";
import {
  localizeBookmarkImages,
  removeBookmarkAssets,
} from "./image-localization-service";
import { normalizeUrl } from "./url-security-service";

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
    );
    return {
      ...result,
      markdownContent: localized.markdownContent,
      contentLength: localized.markdownContent.length,
    };
  } catch {
    return result;
  }
}

export async function createBookmark(
  input: CreateBookmarkInput,
): Promise<BookmarkWithTags> {
  const normalized = normalizeUrl(input.url);
  if (findBookmarkByNormalizedUrl(normalized.normalizedUrl)) {
    throw new AppError("DUPLICATE_URL", undefined, 409);
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
  const shouldKeepEdited =
    existing.isContentEdited && result.status !== "success";
  if (!shouldKeepEdited) {
    result = await localizeExtractionImages(id, result);
  }
  updateBookmarkRecord(id, {
    finalUrl: result.finalUrl,
    title: result.title || existing.title,
    domain: result.domain || existing.domain,
    description: result.description ?? existing.description,
    author: result.author ?? existing.author,
    faviconUrl: result.faviconUrl ?? existing.faviconUrl,
    coverImageUrl: result.coverImageUrl ?? existing.coverImageUrl,
    markdownContent: shouldKeepEdited
      ? existing.markdownContent
      : result.markdownContent,
    plainText: shouldKeepEdited ? existing.plainText : result.plainText,
    contentLength: shouldKeepEdited
      ? existing.contentLength
      : result.contentLength,
    isContentEdited: shouldKeepEdited,
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

export function deleteBookmark(id: string): boolean {
  const deleted = deleteBookmarkRecord(id);
  if (deleted) {
    removeBookmarkAssets(id);
  }
  return deleted;
}

export {
  getBookmarkById,
  listBookmarks,
  type BookmarkListOptions,
};
