import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError, toAppError } from "./errors";

export function apiErrorResponse(error: unknown): NextResponse {
  if (!(error instanceof AppError) && !(error instanceof ZodError)) {
    console.error("Unhandled API error", error);
  }
  const appError =
    error instanceof ZodError
      ? new AppError("VALIDATION_ERROR", undefined, 400)
      : toAppError(error);
  return NextResponse.json(
    {
      error: {
        code: appError.code,
        message: appError.message,
      },
    },
    { status: appError.status },
  );
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new AppError("VALIDATION_ERROR", "请求内容不是有效的 JSON");
  }
}
