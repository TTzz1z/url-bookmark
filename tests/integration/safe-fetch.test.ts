import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { safeFetchHtml } from "@/services/fetch-service";

describe("受限 HTTP 抓取", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    process.env.ALLOW_TEST_LOOPBACK = "1";
    server = createServer((request, response) => {
      switch (request.url) {
        case "/article":
          response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
          response.end("<!doctype html><title>Local</title><p>fixture body</p>");
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
