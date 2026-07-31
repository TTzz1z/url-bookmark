import { apiErrorResponse } from "@/lib/api-response";
import { AppError } from "@/lib/errors";
import { getBookmarkById } from "@/services/bookmark-service";
import {
  listBookmarkAssets,
  localizedAssetReferencePattern,
} from "@/services/image-localization-service";
import { strToU8, zipSync } from "fflate";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function safeFilename(title: string): string {
  const cleaned = title
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return cleaned || "bookmark";
}

function yamlValue(value: string): string {
  return JSON.stringify(value);
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const bookmark = await getBookmarkById(id);
    if (!bookmark) {
      throw new AppError("NOT_FOUND", undefined, 404);
    }
    const frontMatter = [
      "---",
      `title: ${yamlValue(bookmark.title)}`,
      `source: ${yamlValue(bookmark.url)}`,
      `domain: ${yamlValue(bookmark.domain)}`,
      ...(bookmark.coverImageUrl
        ? [`cover_image: ${yamlValue(bookmark.coverImageUrl)}`]
        : []),
      `saved_at: ${yamlValue(bookmark.createdAt.toISOString())}`,
      "tags:",
      ...bookmark.tags.map((tag) => `  - ${yamlValue(tag.name)}`),
      "---",
      "",
    ].join("\n");
    const safeTitle = safeFilename(bookmark.title);
    const body = `${frontMatter}# ${bookmark.title}\n\n${bookmark.markdownContent}\n`;
    const format = new URL(request.url).searchParams.get("format");
    if (format === "zip") {
      const assets = listBookmarkAssets(bookmark.id);
      const portableMarkdown = body.replace(
        localizedAssetReferencePattern(bookmark.id),
        "assets/$1",
      );
      const files: Record<string, Uint8Array> = {
        [`${safeTitle}.md`]: strToU8(portableMarkdown),
      };
      for (const asset of assets) {
        files[`assets/${asset.filename}`] = asset.body;
      }
      const archive = zipSync(files, { level: 6 });
      const filename = `${safeTitle}-图文包.zip`;
      return new Response(Uint8Array.from(archive).buffer, {
        headers: {
          "content-type": "application/zip",
          "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
          "content-length": String(archive.byteLength),
          "x-content-type-options": "nosniff",
        },
      });
    }

    const filename = `${safeTitle}.md`;
    return new Response(body, {
      headers: {
        "content-type": "text/markdown; charset=utf-8",
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
