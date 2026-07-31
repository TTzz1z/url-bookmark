import { describe, expect, it, vi } from "vitest";
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

  it("未知服务端异常不向前端暴露底层错误", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = apiErrorResponse(
      new Error("SQLITE_ERROR: no such column: internal_secret"),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "UNKNOWN_ERROR",
        message: "服务暂时不可用，请稍后重试",
      },
    });
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
