import { AppError } from "@/lib/errors";
import { apiErrorResponse } from "@/lib/api-response";
import {
  DELETED_RETENTION_MS,
  getBookmarkById,
} from "@/services/bookmark-service";
import { readBookmarkAsset } from "@/services/image-localization-service";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string; filename: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id, filename } = await context.params;
    const bookmark = await getBookmarkById(id, { includeDeleted: true });
    const deletionExpired =
      bookmark?.deletedAt &&
      Date.now() - new Date(bookmark.deletedAt).getTime() > DELETED_RETENTION_MS;
    if (!bookmark || deletionExpired) {
      throw new AppError("NOT_FOUND", undefined, 404);
    }
    const asset = readBookmarkAsset(id, filename);
    if (!asset) {
      throw new AppError("NOT_FOUND", "未找到该本地图片", 404);
    }
    return new Response(Uint8Array.from(asset.body).buffer, {
      headers: {
        "content-type": asset.contentType,
        "content-length": String(asset.body.byteLength),
        "cache-control": "private, max-age=31536000, immutable",
        "content-security-policy": "default-src 'none'; sandbox",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
