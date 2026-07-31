import type { ExtractionStatus } from "@/db/schema";

export type TagDto = {
  id: string;
  name: string;
  normalizedName: string;
  createdAt: string;
  updatedAt: string;
  bookmarkCount?: number;
};

export type BookmarkDto = {
  id: string;
  url: string;
  normalizedUrl: string;
  finalUrl: string;
  title: string;
  domain: string;
  description: string | null;
  author: string | null;
  faviconUrl: string | null;
  coverImageUrl: string | null;
  markdownContent: string;
  plainText: string;
  userNote: string;
  extractionStatus: ExtractionStatus;
  errorCode: string | null;
  errorMessage: string | null;
  httpStatusCode: number | null;
  contentLength: number;
  isContentEdited: boolean;
  retryCount: number;
  extractedAt: string | null;
  createdAt: string;
  updatedAt: string;
  tags: TagDto[];
};

export type BookmarkListDto = {
  items: BookmarkDto[];
  total: number;
};

export type ApiErrorDto = {
  error: {
    code: string;
    message: string;
  };
};
