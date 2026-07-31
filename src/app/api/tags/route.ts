import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrCreateTag, listTags } from "@/db/repository";
import { apiErrorResponse, readJson } from "@/lib/api-response";

export const runtime = "nodejs";

const schema = z.object({ name: z.string().max(30) });

export async function GET() {
  try {
    return NextResponse.json({ items: listTags() });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const input = schema.parse(await readJson(request));
    return NextResponse.json(getOrCreateTag(input.name), { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
