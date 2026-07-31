import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { resolveDatabasePath } from "@/db/client";
import { safeFetchBinary } from "./fetch-service";

const MAX_IMAGES_PER_BOOKMARK = 60;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_IMAGE_BYTES = 50 * 1024 * 1024;
const IMAGE_DOWNLOAD_WORKERS = 4;
const ASSET_FILENAME_PATTERN =
  /^[a-f0-9]{24}\.(?:png|jpg|gif|webp|avif)$/;
const BOOKMARK_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const remoteImagePattern = /!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/gi;

export type LocalizedImageResult = {
  markdownContent: string;
  localizedCount: number;
  failedCount: number;
  totalBytes: number;
};

export type BookmarkAsset = {
  filename: string;
  contentType: string;
  body: Uint8Array;
};

function assertBookmarkId(bookmarkId: string): void {
  if (!BOOKMARK_ID_PATTERN.test(bookmarkId)) {
    throw new Error("Invalid bookmark asset identifier");
  }
}

export function resolveAssetsRoot(): string {
  const databasePath = resolveDatabasePath();
  const databaseName = path.basename(
    databasePath,
    path.extname(databasePath),
  );
  return path.join(
    path.dirname(databasePath),
    databaseName === "bookmarks" ? "assets" : `${databaseName}.assets`,
  );
}

export function resolveBookmarkAssetDirectory(bookmarkId: string): string {
  assertBookmarkId(bookmarkId);
  return path.join(resolveAssetsRoot(), bookmarkId);
}

function assetContentType(filename: string): string {
  const extension = path.extname(filename).toLocaleLowerCase();
  const contentTypes: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".avif": "image/avif",
  };
  const contentType = contentTypes[extension];
  if (!contentType) {
    throw new Error("Unsupported local image type");
  }
  return contentType;
}

function detectImageExtension(body: Uint8Array): string | null {
  if (
    body.length >= 8 &&
    body[0] === 0x89 &&
    body[1] === 0x50 &&
    body[2] === 0x4e &&
    body[3] === 0x47 &&
    body[4] === 0x0d &&
    body[5] === 0x0a &&
    body[6] === 0x1a &&
    body[7] === 0x0a
  ) {
    return "png";
  }
  if (
    body.length >= 3 &&
    body[0] === 0xff &&
    body[1] === 0xd8 &&
    body[2] === 0xff
  ) {
    return "jpg";
  }
  if (
    body.length >= 6 &&
    String.fromCharCode(...body.slice(0, 6)) === "GIF87a"
  ) {
    return "gif";
  }
  if (
    body.length >= 6 &&
    String.fromCharCode(...body.slice(0, 6)) === "GIF89a"
  ) {
    return "gif";
  }
  if (
    body.length >= 12 &&
    String.fromCharCode(...body.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...body.slice(8, 12)) === "WEBP"
  ) {
    return "webp";
  }
  if (
    body.length >= 12 &&
    String.fromCharCode(...body.slice(4, 8)) === "ftyp" &&
    ["avif", "avis"].includes(String.fromCharCode(...body.slice(8, 12)))
  ) {
    return "avif";
  }
  return null;
}

function expectedExtension(contentType: string): string {
  return contentType === "image/jpeg"
    ? "jpg"
    : contentType.replace(/^image\//, "");
}

async function replaceAssetDirectory(
  bookmarkId: string,
  stagingDirectory: string,
): Promise<void> {
  const finalDirectory = resolveBookmarkAssetDirectory(bookmarkId);
  const backupDirectory = `${finalDirectory}.backup-${randomUUID()}`;
  const hasExisting = fs.existsSync(finalDirectory);
  try {
    if (hasExisting) {
      await fs.promises.rename(finalDirectory, backupDirectory);
    }
    await fs.promises.rename(stagingDirectory, finalDirectory);
    if (hasExisting) {
      await fs.promises.rm(backupDirectory, { recursive: true, force: true });
    }
  } catch (error) {
    if (!fs.existsSync(finalDirectory) && fs.existsSync(backupDirectory)) {
      await fs.promises.rename(backupDirectory, finalDirectory);
    }
    throw error;
  } finally {
    if (fs.existsSync(stagingDirectory)) {
      await fs.promises.rm(stagingDirectory, {
        recursive: true,
        force: true,
      });
    }
  }
}

export async function localizeBookmarkImages(
  bookmarkId: string,
  markdownContent: string,
  sourceUrl: string,
): Promise<LocalizedImageResult> {
  assertBookmarkId(bookmarkId);
  const matches = Array.from(markdownContent.matchAll(remoteImagePattern));
  const uniqueUrls = Array.from(
    new Set(matches.map((match) => match[2])),
  ).slice(0, MAX_IMAGES_PER_BOOKMARK);
  const assetsRoot = resolveAssetsRoot();
  await fs.promises.mkdir(assetsRoot, { recursive: true });
  const stagingDirectory = path.join(
    assetsRoot,
    `.${bookmarkId}.staging-${randomUUID()}`,
  );
  await fs.promises.mkdir(stagingDirectory, { recursive: true });

  const localizedUrlByRemote = new Map<string, string>();
  let nextIndex = 0;
  let failedCount = Math.max(
    0,
    new Set(matches.map((match) => match[2])).size -
      MAX_IMAGES_PER_BOOKMARK,
  );
  let totalBytes = 0;

  const worker = async () => {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      const remoteUrl = uniqueUrls[currentIndex];
      if (!remoteUrl) {
        return;
      }
      try {
        const fetched = await safeFetchBinary(remoteUrl, {
          timeoutMs: 15_000,
          maxBytes: MAX_IMAGE_BYTES,
          maxRedirects: 5,
          referer: sourceUrl,
        });
        const extension = detectImageExtension(fetched.body);
        if (
          !extension ||
          extension !== expectedExtension(fetched.contentType)
        ) {
          throw new Error("Image signature does not match content type");
        }
        if (totalBytes + fetched.body.byteLength > MAX_TOTAL_IMAGE_BYTES) {
          throw new Error("Bookmark image archive exceeds total size limit");
        }
        totalBytes += fetched.body.byteLength;
        const hash = createHash("sha256")
          .update(remoteUrl)
          .digest("hex")
          .slice(0, 24);
        const filename = `${hash}.${extension}`;
        await fs.promises.writeFile(
          path.join(stagingDirectory, filename),
          fetched.body,
        );
        localizedUrlByRemote.set(
          remoteUrl,
          `/api/bookmarks/${bookmarkId}/assets/${filename}`,
        );
      } catch {
        failedCount += 1;
      }
    }
  };

  try {
    await Promise.all(
      Array.from(
        {
          length: Math.min(IMAGE_DOWNLOAD_WORKERS, uniqueUrls.length),
        },
        () => worker(),
      ),
    );
    await replaceAssetDirectory(bookmarkId, stagingDirectory);
  } catch (error) {
    await fs.promises.rm(stagingDirectory, {
      recursive: true,
      force: true,
    });
    throw error;
  }

  return {
    markdownContent: markdownContent.replace(
      remoteImagePattern,
      (original, alt: string, remoteUrl: string) => {
        const localizedUrl = localizedUrlByRemote.get(remoteUrl);
        return localizedUrl ? `![${alt}](${localizedUrl})` : original;
      },
    ),
    localizedCount: localizedUrlByRemote.size,
    failedCount,
    totalBytes,
  };
}

export function removeBookmarkAssets(bookmarkId: string): void {
  const directory = resolveBookmarkAssetDirectory(bookmarkId);
  fs.rmSync(directory, { recursive: true, force: true });
}

export function readBookmarkAsset(
  bookmarkId: string,
  filename: string,
): BookmarkAsset | null {
  assertBookmarkId(bookmarkId);
  if (!ASSET_FILENAME_PATTERN.test(filename)) {
    return null;
  }
  const assetDirectory = resolveBookmarkAssetDirectory(bookmarkId);
  const target = path.join(assetDirectory, filename);
  if (!target.startsWith(`${assetDirectory}${path.sep}`)) {
    return null;
  }
  try {
    return {
      filename,
      contentType: assetContentType(filename),
      body: new Uint8Array(fs.readFileSync(target)),
    };
  } catch {
    return null;
  }
}

export function listBookmarkAssets(bookmarkId: string): BookmarkAsset[] {
  const directory = resolveBookmarkAssetDirectory(bookmarkId);
  if (!fs.existsSync(directory)) {
    return [];
  }
  return fs
    .readdirSync(directory)
    .filter((filename) => ASSET_FILENAME_PATTERN.test(filename))
    .sort()
    .flatMap((filename) => {
      const asset = readBookmarkAsset(bookmarkId, filename);
      return asset ? [asset] : [];
    });
}

export function localizedAssetReferencePattern(bookmarkId: string): RegExp {
  assertBookmarkId(bookmarkId);
  return new RegExp(
    `/api/bookmarks/${bookmarkId}/assets/([a-f0-9]{24}\\.(?:png|jpg|gif|webp|avif))`,
    "g",
  );
}
