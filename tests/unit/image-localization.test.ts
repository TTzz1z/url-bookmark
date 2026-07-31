import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { safeFetchBinary } from "@/services/fetch-service";
import { AppError } from "@/lib/errors";
import {
  listBookmarkAssets,
  localizeBookmarkImages,
  removeBookmarkAssets,
  resolveAssetsRoot,
} from "@/services/image-localization-service";

vi.mock("@/services/fetch-service", () => ({
  safeFetchBinary: vi.fn(),
}));

const mockedSafeFetchBinary = vi.mocked(safeFetchBinary);
const pngBody = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
]);

describe("正文图片本地化", () => {
  let tempDirectory: string;
  let previousDatabasePath: string | undefined;

  beforeEach(() => {
    previousDatabasePath = process.env.DATABASE_PATH;
    tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "bookmark-images-"));
    process.env.DATABASE_PATH = path.join(tempDirectory, "bookmarks.db");
    mockedSafeFetchBinary.mockReset();
  });

  afterEach(() => {
    if (previousDatabasePath === undefined) {
      delete process.env.DATABASE_PATH;
    } else {
      process.env.DATABASE_PATH = previousDatabasePath;
    }
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  });

  it("下载、去重并把远程图片改写为本地受控地址", async () => {
    mockedSafeFetchBinary.mockResolvedValue({
      body: pngBody,
      finalUrl: "https://cdn.example.com/diagram.png",
      statusCode: 200,
      contentType: "image/png",
    });
    const remoteUrl = "https://cdn.example.com/diagram.png";
    const result = await localizeBookmarkImages(
      "bookmark-image-test",
      `![流程图](${remoteUrl})\n\n![再次引用](${remoteUrl})`,
      "https://example.com/article",
    );

    expect(result.localizedCount).toBe(1);
    expect(result.failedCount).toBe(0);
    expect(mockedSafeFetchBinary).toHaveBeenCalledTimes(1);
    expect(result.markdownContent).toMatch(
      /!\[流程图\]\(\/api\/bookmarks\/bookmark-image-test\/assets\/[a-f0-9]{24}\.png\)/,
    );
    expect(listBookmarkAssets("bookmark-image-test")).toHaveLength(1);
  });

  it("图片下载失败时保留远程链接，不影响正文", async () => {
    mockedSafeFetchBinary.mockRejectedValue(new Error("forbidden"));
    const remoteUrl = "https://cdn.example.com/protected.png";
    const result = await localizeBookmarkImages(
      "bookmark-image-failed",
      `正文\n\n![受限图片](${remoteUrl})`,
      "https://example.com/article",
    );

    expect(result.localizedCount).toBe(0);
    expect(result.failedCount).toBe(1);
    expect(result.markdownContent).toContain(remoteUrl);
    expect(listBookmarkAssets("bookmark-image-failed")).toHaveLength(0);
  });

  it("对超时图片进行有限重试", async () => {
    mockedSafeFetchBinary
      .mockRejectedValueOnce(new AppError("REQUEST_TIMEOUT", undefined, 408))
      .mockRejectedValueOnce(new AppError("REQUEST_TIMEOUT", undefined, 408))
      .mockResolvedValueOnce({
        body: pngBody,
        finalUrl: "https://cdn.example.com/eventual.png",
        statusCode: 200,
        contentType: "image/png",
      });
    const result = await localizeBookmarkImages(
      "bookmark-image-retry",
      "![重试图片](https://cdn.example.com/eventual.png)",
      "https://example.com/article",
    );
    expect(mockedSafeFetchBinary).toHaveBeenCalledTimes(3);
    expect(result.localizedCount).toBe(1);
  });

  it("支持 Markdown 尖括号中带括号的图片 URL", async () => {
    mockedSafeFetchBinary.mockResolvedValue({
      body: pngBody,
      finalUrl: "https://cdn.example.com/diagram(large).png",
      statusCode: 200,
      contentType: "image/png",
    });
    const remoteUrl = "https://cdn.example.com/diagram(large).png";
    const result = await localizeBookmarkImages(
      "bookmark-image-parentheses",
      `![带括号图片](<${remoteUrl}>)`,
      "https://example.com/article",
    );

    expect(result.localizedCount).toBe(1);
    expect(result.markdownContent).not.toContain(remoteUrl);
    expect(result.markdownContent).toContain(
      "/api/bookmarks/bookmark-image-parentheses/assets/",
    );
  });

  it("额外归档封面并返回远程到本地的映射", async () => {
    mockedSafeFetchBinary.mockResolvedValue({
      body: pngBody,
      finalUrl: "https://cdn.example.com/cover.png",
      statusCode: 200,
      contentType: "image/png",
    });
    const coverUrl = "https://cdn.example.com/cover.png";
    const result = await localizeBookmarkImages(
      "bookmark-cover-test",
      "正文没有内嵌图片。",
      "https://example.com/article",
      [],
      [coverUrl],
    );

    expect(result.localizedCount).toBe(1);
    expect(result.localizedUrlByRemote[coverUrl]).toMatch(
      /^\/api\/bookmarks\/bookmark-cover-test\/assets\//,
    );
  });

  it("清洗远程 SVG 后再保存", async () => {
    const svgBody = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><script>alert(1)</script><a href="https://evil.example/"><rect width="20" height="20" fill="theme1"/></a></svg>',
    );
    mockedSafeFetchBinary.mockResolvedValue({
      body: svgBody,
      finalUrl: "https://cdn.example.com/diagram.svg",
      statusCode: 200,
      contentType: "image/svg+xml",
    });
    const result = await localizeBookmarkImages(
      "bookmark-svg-test",
      "![SVG](https://cdn.example.com/diagram.svg)",
      "https://example.com/article",
    );
    const [asset] = listBookmarkAssets("bookmark-svg-test");

    expect(result.localizedCount).toBe(1);
    expect(asset.contentType).toBe("image/svg+xml");
    expect(new TextDecoder().decode(asset.body)).not.toMatch(
      /<script|https:\/\/evil\.example/i,
    );
  });

  it("删除书签图片目录", async () => {
    mockedSafeFetchBinary.mockResolvedValue({
      body: pngBody,
      finalUrl: "https://cdn.example.com/diagram.png",
      statusCode: 200,
      contentType: "image/png",
    });
    await localizeBookmarkImages(
      "bookmark-image-delete",
      "![图](https://cdn.example.com/diagram.png)",
      "https://example.com/article",
    );
    expect(listBookmarkAssets("bookmark-image-delete")).toHaveLength(1);
    removeBookmarkAssets("bookmark-image-delete");
    expect(listBookmarkAssets("bookmark-image-delete")).toHaveLength(0);
  });

  it("自定义数据库使用独立图片目录", () => {
    process.env.DATABASE_PATH = path.join(tempDirectory, "e2e-bookmarks.db");
    expect(resolveAssetsRoot()).toBe(
      path.join(tempDirectory, "e2e-bookmarks.assets"),
    );
  });
});
