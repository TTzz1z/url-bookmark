import { describe, expect, it } from "vitest";
import { z } from "zod";
import { apiErrorResponse } from "@/lib/api-response";

describe("API 参数错误映射", () => {
  it("把 Zod 校验失败映射为 400 VALIDATION_ERROR", async () => {
    let validationError: unknown;
    try {
      z.object({ url: z.string().url() }).parse({ url: 42 });
    } catch (error) {
      validationError = error;
    }

    const response = apiErrorResponse(validationError);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "提交内容不符合要求",
      },
    });
  });
});
