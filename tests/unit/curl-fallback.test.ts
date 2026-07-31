import { describe, expect, it } from "vitest";
import {
  parseCurlIncludeOutput,
  shouldRetryHtmlWithCurl,
} from "@/services/fetch-service";

describe("curl HTML 回退辅助", () => {
  it("识别适合改走 curl 的状态码", () => {
    expect(shouldRetryHtmlWithCurl(403)).toBe(true);
    expect(shouldRetryHtmlWithCurl(401)).toBe(true);
    expect(shouldRetryHtmlWithCurl(429)).toBe(true);
    expect(shouldRetryHtmlWithCurl(503)).toBe(true);
    expect(shouldRetryHtmlWithCurl(404)).toBe(false);
    expect(shouldRetryHtmlWithCurl(200)).toBe(false);
  });

  it("解析 curl --include 输出的状态、响应头和正文", () => {
    const raw = Buffer.from(
      [
        "HTTP/1.1 200 OK",
        "Content-Type: text/html; charset=utf-8",
        "X-Test: yes",
        "",
        "<!doctype html><title>你好</title><p>正文</p>",
      ].join("\r\n"),
      "utf8",
    );
    const parsed = parseCurlIncludeOutput(raw);
    expect(parsed.statusCode).toBe(200);
    expect(parsed.headers["content-type"]).toBe("text/html; charset=utf-8");
    expect(parsed.headers["x-test"]).toBe("yes");
    expect(Buffer.from(parsed.body).toString("utf8")).toContain("<title>你好</title>");
  });

  it("跳过 100 Continue 中间响应", () => {
    const raw = Buffer.from(
      [
        "HTTP/1.1 100 Continue",
        "",
        "HTTP/1.1 200 OK",
        "Content-Type: text/html",
        "",
        "<html>ok</html>",
      ].join("\r\n"),
      "utf8",
    );
    const parsed = parseCurlIncludeOutput(raw);
    expect(parsed.statusCode).toBe(200);
    expect(Buffer.from(parsed.body).toString("utf8")).toBe("<html>ok</html>");
  });
});
