import { NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, readJson } from "@/lib/api-response";
import { reExtractBookmark } from "@/services/bookmark-service";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const schema = z.object({
  overwriteEditedContent: z.boolean().default(false),
});

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const input = schema.parse(await readJson(request));
    const bookmark = await reExtractBookmark(
      id,
      input.overwriteEditedContent,
    );
    return NextResponse.json(bookmark);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
