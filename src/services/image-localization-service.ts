import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import createDOMPurify from "dompurify";
import { JSDOM } from "jsdom";
import type { Image as MarkdownImage } from "mdast";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { resolveDatabasePath } from "@/db/client";
import { AppError } from "@/lib/errors";
import { safeFetchBinary } from "./fetch-service";

const MAX_IMAGES_PER_BOOKMARK = 60;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_IMAGE_BYTES = 50 * 1024 * 1024;
const IMAGE_DOWNLOAD_WORKERS = 4;
const IMAGE_DOWNLOAD_ATTEMPTS = 3;
const IMAGE_DOWNLOAD_TIMEOUT_MS = 25_000;
const ASSET_FILENAME_PATTERN = /^[a-f0-9]{24}\.(?:png|jpg|gif|webp|avif|svg)$/;
const BOOKMARK_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export type GeneratedBookmarkImage = {
  title: string;
  contentType: string;
  body: Uint8Array;
  placeholder?: string;
};

export type LocalizedImageResult = {
  markdownContent: string;
  localizedCount: number;
  failedCount: number;
  totalBytes: number;
  attachedCharts: Array<{
    title: string;
    localUrl: string;
    placeholder?: string;
  }>;
  localizedUrlByRemote: Record<string, string>;
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
  const databaseName = path.basename(databasePath, path.extname(databasePath));
  return path.join(
    /* turbopackIgnore: true */ path.dirname(databasePath),
    databaseName === "bookmarks" ? "assets" : `${databaseName}.assets`,
  );
}

export function resolveBookmarkAssetDirectory(bookmarkId: string): string {
  assertBookmarkId(bookmarkId);
  return path.join(/* turbopackIgnore: true */ resolveAssetsRoot(), bookmarkId);
}

function assetContentType(filename: string): string {
  const extension = path.extname(filename).toLocaleLowerCase();
  const contentTypes: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".avif": "image/avif",
    ".svg": "image/svg+xml",
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
  const head = new TextDecoder("utf8", { fatal: false })
    .decode(body.subarray(0, Math.min(body.length, 256)))
    .trimStart()
    .toLocaleLowerCase();
  if (head.startsWith("<svg") || head.startsWith("<?xml")) {
    return "svg";
  }
  return null;
}

function expectedExtension(contentType: string): string {
  if (contentType === "image/jpeg") {
    return "jpg";
  }
  if (contentType === "image/svg+xml") {
    return "svg";
  }
  return contentType.replace(/^image\//, "");
}

type MarkdownImageReference = {
  alt: string;
  title: string | null;
  url: string;
  start: number;
  end: number;
};

function markdownImageReferences(markdown: string): MarkdownImageReference[] {
  try {
    const tree = unified().use(remarkParse).parse(markdown);
    const references: MarkdownImageReference[] = [];
    visit(tree, "image", (node: MarkdownImage) => {
      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      if (
        typeof start === "number" &&
        typeof end === "number" &&
        /^https?:\/\//i.test(node.url)
      ) {
        references.push({
          alt: node.alt ?? "",
          title: node.title ?? null,
          url: node.url,
          start,
          end,
        });
      }
    });
    return references;
  } catch {
    return [];
  }
}

function escapeMarkdownLabel(value: string): string {
  return value.replace(/([\\\[\]])/g, "\\$1");
}

function replaceLocalizedMarkdownImages(
  markdown: string,
  references: MarkdownImageReference[],
  localizedUrlByRemote: Map<string, string>,
): string {
  let next = markdown;
  for (const reference of [...references].sort(
    (left, right) => right.start - left.start,
  )) {
    const localizedUrl = localizedUrlByRemote.get(reference.url);
    if (!localizedUrl) {
      continue;
    }
    const title = reference.title
      ? ` "${reference.title.replace(/["\\]/g, "\\$&")}"`
      : "";
    const replacement = `![${escapeMarkdownLabel(reference.alt)}](${localizedUrl}${title})`;
    next = `${next.slice(0, reference.start)}${replacement}${next.slice(reference.end)}`;
  }
  return next;
}

function isRetryableImageError(error: unknown): boolean {
  if (error instanceof TypeError) {
    return true;
  }
  return (
    error instanceof AppError &&
    [
      "REQUEST_TIMEOUT",
      "HTTP_FORBIDDEN",
      "HTTP_SERVER_ERROR",
      "UNKNOWN_ERROR",
    ].includes(error.code)
  );
}

async function waitBeforeImageRetry(attempt: number): Promise<void> {
  const delayMs =
    process.env.NODE_ENV === "test" ? 1 : attempt === 1 ? 250 : 750;
  await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
}

async function fetchRemoteImage(remoteUrl: string, sourceUrl: string) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= IMAGE_DOWNLOAD_ATTEMPTS; attempt += 1) {
    try {
      return await safeFetchBinary(remoteUrl, {
        timeoutMs: IMAGE_DOWNLOAD_TIMEOUT_MS,
        maxBytes: MAX_IMAGE_BYTES,
        maxRedirects: 5,
        referer: sourceUrl,
      });
    } catch (error) {
      lastError = error;
      if (
        attempt === IMAGE_DOWNLOAD_ATTEMPTS ||
        !isRetryableImageError(error)
      ) {
        break;
      }
      await waitBeforeImageRetry(attempt);
    }
  }
  throw lastError;
}

function sanitizeRemoteSvg(body: Uint8Array): Uint8Array | null {
  try {
    const raw = new TextDecoder("utf8", { fatal: true }).decode(body);
    const dom = new JSDOM("", { contentType: "text/html" });
    const purifier = createDOMPurify(
      dom.window as unknown as Window & typeof globalThis,
    );
    const sanitized = purifier.sanitize(raw, {
      USE_PROFILES: { svg: true, svgFilters: true },
      FORBID_TAGS: [
        "script",
        "foreignObject",
        "iframe",
        "object",
        "embed",
        "audio",
        "video",
      ],
      ALLOW_UNKNOWN_PROTOCOLS: false,
    }) as string;
    const svgDom = new JSDOM(sanitized, { contentType: "image/svg+xml" });
    const root = svgDom.window.document.documentElement;
    if (root.localName !== "svg") {
      return null;
    }
    for (const element of root.querySelectorAll<SVGElement>("*")) {
      for (const attributeName of ["href", "xlink:href"]) {
        const value = element.getAttribute(attributeName)?.trim();
        if (value && !value.startsWith("#")) {
          element.removeAttribute(attributeName);
        }
      }
      const style = element.getAttribute("style");
      if (style && /(?:url\s*\(|@import)/i.test(style)) {
        element.removeAttribute("style");
      }
    }
    const result = root.outerHTML;
    return result.length >= 40 ? new TextEncoder().encode(result) : null;
  } catch {
    return null;
  }
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
  generatedImages: GeneratedBookmarkImage[] = [],
  additionalImageUrls: string[] = [],
): Promise<LocalizedImageResult> {
  assertBookmarkId(bookmarkId);
  const references = markdownImageReferences(markdownContent);
  const allUniqueUrls = Array.from(
    new Set([
      ...additionalImageUrls.filter((url) => /^https?:\/\//i.test(url)),
      ...references.map((reference) => reference.url),
    ]),
  );
  const uniqueUrls = Array.from(allUniqueUrls).slice(
    0,
    MAX_IMAGES_PER_BOOKMARK,
  );

  if (uniqueUrls.length === 0 && generatedImages.length === 0) {
    await fs.promises.rm(resolveBookmarkAssetDirectory(bookmarkId), {
      recursive: true,
      force: true,
    });
    return {
      markdownContent,
      localizedCount: 0,
      failedCount: 0,
      totalBytes: 0,
      attachedCharts: [],
      localizedUrlByRemote: {},
    };
  }

  const assetsRoot = resolveAssetsRoot();
  await fs.promises.mkdir(assetsRoot, { recursive: true });
  const stagingDirectory = path.join(
    assetsRoot,
    `.${bookmarkId}.staging-${randomUUID()}`,
  );
  await fs.promises.mkdir(stagingDirectory, { recursive: true });

  const localizedUrlByRemote = new Map<string, string>();
  const attachedCharts: Array<{
    title: string;
    localUrl: string;
    placeholder?: string;
  }> = [];
  let nextIndex = 0;
  let failedCount = Math.max(0, allUniqueUrls.length - MAX_IMAGES_PER_BOOKMARK);
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
        const fetched = await fetchRemoteImage(remoteUrl, sourceUrl);
        const archivedBody =
          fetched.contentType === "image/svg+xml"
            ? sanitizeRemoteSvg(fetched.body)
            : fetched.body;
        if (!archivedBody) {
          throw new Error("Unsafe or malformed SVG image");
        }
        const extension = detectImageExtension(archivedBody);
        if (
          !extension ||
          extension !== expectedExtension(fetched.contentType)
        ) {
          throw new Error("Image signature does not match content type");
        }
        if (totalBytes + archivedBody.byteLength > MAX_TOTAL_IMAGE_BYTES) {
          throw new Error("Bookmark image archive exceeds total size limit");
        }
        totalBytes += archivedBody.byteLength;
        const hash = createHash("sha256")
          .update(remoteUrl)
          .digest("hex")
          .slice(0, 24);
        const filename = `${hash}.${extension}`;
        await fs.promises.writeFile(
          path.join(stagingDirectory, filename),
          archivedBody,
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
          length: Math.min(IMAGE_DOWNLOAD_WORKERS, uniqueUrls.length || 1),
        },
        () => worker(),
      ),
    );

    for (const [index, image] of generatedImages.entries()) {
      const extension = detectImageExtension(image.body);
      if (!extension) {
        failedCount += 1;
        continue;
      }
      if (totalBytes + image.body.byteLength > MAX_TOTAL_IMAGE_BYTES) {
        failedCount += 1;
        continue;
      }
      totalBytes += image.body.byteLength;
      const hash = createHash("sha256")
        .update(image.body)
        .update(`\0${image.title}\0${index}`)
        .digest("hex")
        .slice(0, 24);
      const filename = `${hash}.${extension}`;
      await fs.promises.writeFile(
        path.join(stagingDirectory, filename),
        image.body,
      );
      attachedCharts.push({
        title: image.title,
        localUrl: `/api/bookmarks/${bookmarkId}/assets/${filename}`,
        placeholder: image.placeholder,
      });
    }

    await replaceAssetDirectory(bookmarkId, stagingDirectory);
  } catch (error) {
    await fs.promises.rm(stagingDirectory, {
      recursive: true,
      force: true,
    });
    throw error;
  }

  return {
    markdownContent: replaceLocalizedMarkdownImages(
      markdownContent,
      references,
      localizedUrlByRemote,
    ),
    localizedCount: localizedUrlByRemote.size + attachedCharts.length,
    failedCount,
    totalBytes,
    attachedCharts,
    localizedUrlByRemote: Object.fromEntries(localizedUrlByRemote),
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
      body: new Uint8Array(fs.readFileSync(/* turbopackIgnore: true */ target)),
    };
  } catch {
    return null;
  }
}

export function listBookmarkAssets(bookmarkId: string): BookmarkAsset[] {
  const directory = resolveBookmarkAssetDirectory(bookmarkId);
  if (!fs.existsSync(/* turbopackIgnore: true */ directory)) {
    return [];
  }
  return fs
    .readdirSync(/* turbopackIgnore: true */ directory)
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
    `/api/bookmarks/${bookmarkId}/assets/([a-f0-9]{24}\\.(?:png|jpg|gif|webp|avif|svg))`,
    "g",
  );
}
