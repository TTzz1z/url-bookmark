import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-response";
import { AppError } from "@/lib/errors";
import { restoreBookmark } from "@/services/bookmark-service";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const restored = await restoreBookmark(id);
    if (!restored) {
      throw new AppError("NOT_FOUND", "这条收藏已经无法恢复", 404);
    }
    return NextResponse.json(restored);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
