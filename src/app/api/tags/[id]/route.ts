import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteTag, updateTag } from "@/db/repository";
import { apiErrorResponse, readJson } from "@/lib/api-response";
import { AppError } from "@/lib/errors";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const schema = z.object({ name: z.string().max(30) });

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const input = schema.parse(await readJson(request));
    return NextResponse.json(updateTag(id, input.name));
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    if (!deleteTag(id)) {
      throw new AppError("NOT_FOUND", "未找到该标签", 404);
    }
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
