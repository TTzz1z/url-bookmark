import { NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, readJson } from "@/lib/api-response";
import { AppError } from "@/lib/errors";
import {
  deleteBookmark,
  getBookmarkById,
  updateBookmark,
} from "@/services/bookmark-service";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const updateSchema = z
  .object({
    title: z.string().max(300).optional(),
    userNote: z.string().max(5_000).optional(),
    markdownContent: z.string().max(2 * 1024 * 1024).optional(),
    tagNames: z.array(z.string()).max(12).optional(),
  })
  .strict();

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const bookmark = await getBookmarkById(id);
    if (!bookmark) {
      throw new AppError("NOT_FOUND", undefined, 404);
    }
    return NextResponse.json(bookmark);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const input = updateSchema.parse(await readJson(request));
    const bookmark = await updateBookmark(id, input);
    return NextResponse.json(bookmark);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    if (!deleteBookmark(id)) {
      throw new AppError("NOT_FOUND", undefined, 404);
    }
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
