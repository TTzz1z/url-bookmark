import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { safeFetchBinary, safeFetchHtml } from "@/services/fetch-service";

describe("受限 HTTP 抓取", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    process.env.ALLOW_TEST_LOOPBACK = "1";
    server = createServer((request, response) => {
      switch (request.url) {
        case "/article":
          response.writeHead(200, {
            "content-type": "text/html; charset=utf-8",
          });
          response.end(
            "<!doctype html><title>Local</title><p>fixture body</p>",
          );
          break;
        case "/gbk-header":
          response.writeHead(200, { "content-type": "text/html; charset=gbk" });
          response.end(
            Buffer.from(
              "3c21646f63747970652068746d6c3e3c6d65746120636861727365743d2267626b223e3c7469746c653ed6d0cec4b1eacce23c2f7469746c653e3c703eb3a3bcfbd6d0cec4b1e0c2ebd2b3c3e63c2f703e",
              "hex",
            ),
          );
          break;
        case "/gb18030-meta":
          response.writeHead(200, { "content-type": "text/html" });
          response.end(
            Buffer.from(
              "3c21646f63747970652068746d6c3e3c6d65746120636861727365743d2267623138303330223e3c7469746c653ed6d0cec4b1eacce23c2f7469746c653e3c703eb3a3bcfbd6d0cec4b1e0c2ebd2b3c3e63c2f703e",
              "hex",
            ),
          );
          break;
        case "/forbidden":
          response.writeHead(403, { "content-type": "text/html" });
          response.end("<p>forbidden</p>");
          break;
        case "/missing":
          response.writeHead(404, { "content-type": "text/html" });
          response.end("<p>missing</p>");
          break;
        case "/binary":
          response.writeHead(200, { "content-type": "application/pdf" });
          response.end("%PDF");
          break;
        case "/image.svg":
          response.writeHead(200, { "content-type": "image/svg+xml" });
          response.end(
            '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>',
          );
          break;
        case "/large":
          response.writeHead(200, { "content-type": "text/html" });
          response.end(`<p>${"x".repeat(2048)}</p>`);
          break;
        case "/slow":
          setTimeout(() => {
            response.writeHead(200, { "content-type": "text/html" });
            response.end("<p>slow</p>");
          }, 250);
          break;
        case "/private-redirect":
          response.writeHead(302, {
            location: "http://169.254.169.254/latest/meta-data/",
          });
          response.end();
          break;
        case "/loop":
          response.writeHead(302, { location: "/loop" });
          response.end();
          break;
        default:
          response.writeHead(500);
          response.end();
      }
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    delete process.env.ALLOW_TEST_LOOPBACK;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it("读取 HTML 并返回最终地址", async () => {
    const result = await safeFetchHtml(`${baseUrl}/article`);
    expect(result.statusCode).toBe(200);
    expect(result.html).toContain("fixture body");
  });

  it("允许下载随后会被清洗的远程 SVG 图片", async () => {
    const result = await safeFetchBinary(`${baseUrl}/image.svg`, {
      timeoutMs: 1_000,
      maxBytes: 5_000,
      maxRedirects: 2,
      referer: `${baseUrl}/article`,
    });
    expect(result.contentType).toBe("image/svg+xml");
    expect(new TextDecoder().decode(result.body)).toContain("<svg");
  });

  it.each(["/gbk-header", "/gb18030-meta"])(
    "按声明解码常见中文编码 %s",
    async (route) => {
      const result = await safeFetchHtml(`${baseUrl}${route}`);
      expect(result.html).toContain("<title>中文标题</title>");
      expect(result.html).toContain("常见中文编码页面");
      expect(result.html).not.toContain("�");
    },
  );

  it.each([
    ["/forbidden", "HTTP_FORBIDDEN"],
    ["/missing", "HTTP_NOT_FOUND"],
    ["/binary", "UNSUPPORTED_CONTENT_TYPE"],
  ])("映射 %s 的错误", async (route, code) => {
    await expect(safeFetchHtml(`${baseUrl}${route}`)).rejects.toMatchObject({
      code,
    });
  });

  it("限制响应体大小", async () => {
    await expect(
      safeFetchHtml(`${baseUrl}/large`, {
        timeoutMs: 1_000,
        maxBytes: 128,
        maxRedirects: 2,
      }),
    ).rejects.toMatchObject({ code: "CONTENT_TOO_LARGE" });
  });

  it("主动终止超时请求", async () => {
    await expect(
      safeFetchHtml(`${baseUrl}/slow`, {
        timeoutMs: 40,
        maxBytes: 5_000,
        maxRedirects: 2,
      }),
    ).rejects.toMatchObject({ code: "REQUEST_TIMEOUT" });
  });

  it("重定向到内网时再次拦截", async () => {
    await expect(
      safeFetchHtml(`${baseUrl}/private-redirect`),
    ).rejects.toMatchObject({ code: "PRIVATE_NETWORK_BLOCKED" });
  });

  it("限制重定向次数", async () => {
    await expect(
      safeFetchHtml(`${baseUrl}/loop`, {
        timeoutMs: 1_000,
        maxBytes: 5_000,
        maxRedirects: 2,
      }),
    ).rejects.toMatchObject({ code: "TOO_MANY_REDIRECTS" });
  });
});
