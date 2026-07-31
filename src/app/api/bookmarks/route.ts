import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, readJson } from "@/lib/api-response";
import { createBookmark, listBookmarks } from "@/services/bookmark-service";
import { extractionStatuses } from "@/db/schema";

export const runtime = "nodejs";

const createSchema = z.object({
  url: z.string().max(4_000),
  tagNames: z.array(z.string()).max(12).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const rawStatus = params.get("status") ?? "";
    const status = extractionStatuses.includes(
      rawStatus as (typeof extractionStatuses)[number],
    )
      ? (rawStatus as (typeof extractionStatuses)[number])
      : "";
    const rawSort = params.get("sort");
    const sort =
      rawSort === "updated" || rawSort === "title" ? rawSort : "created";
    const result = await listBookmarks({
      q: params.get("q") ?? "",
      tagId: params.get("tag") ?? "",
      status,
      sort,
      page: Number.parseInt(params.get("page") ?? "1", 10) || 1,
      pageSize: Number.parseInt(params.get("pageSize") ?? "50", 10) || 50,
    });
    return NextResponse.json(result);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const input = createSchema.parse(await readJson(request));
    const bookmark = await createBookmark(input);
    return NextResponse.json(bookmark, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
