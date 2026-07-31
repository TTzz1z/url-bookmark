import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { closeDatabase, createDatabase, getDatabase } from "@/db/client";
import {
  createBookmark,
  deleteBookmark,
  getBookmarkById,
  purgeExpiredBookmarks,
  reExtractBookmark,
  restoreBookmark,
  updateBookmark,
} from "@/services/bookmark-service";
import { extractUrl } from "@/services/extraction-service";
import { resolveBookmarkAssetDirectory } from "@/services/image-localization-service";

vi.mock("@/services/extraction-service", () => ({
  extractUrl: vi.fn(),
}));

const mockedExtractUrl = vi.mocked(extractUrl);

const successfulExtraction = {
  finalUrl: "https://example.com/article",
  title: "自动提取标题",
  domain: "example.com",
  markdownContent: "# 自动正文\n\n稳定的提取内容。",
  plainText: "自动正文 稳定的提取内容。",
  contentLength: 20,
  status: "success" as const,
  httpStatusCode: 200,
};

const failedExtraction = {
  finalUrl: "https://example.com/article",
  title: "example.com",
  domain: "example.com",
  markdownContent: "",
  plainText: "",
  contentLength: 0,
  status: "failed" as const,
  errorCode: "REQUEST_TIMEOUT",
  errorMessage: "请求网页超时",
};

describe("书签失败保留与重新提取覆盖保护", () => {
  let tempDirectory: string;
  let previousDatabasePath: string | undefined;

  beforeAll(() => {
    previousDatabasePath = process.env.DATABASE_PATH;
    tempDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), "url-bookmark-service-test-"),
    );
    process.env.DATABASE_PATH = path.join(tempDirectory, "bookmarks.db");
    const database = createDatabase();
    migrate(database, {
      migrationsFolder: path.resolve(process.cwd(), "drizzle"),
    });
    database.$client.close();
  });

  beforeEach(() => {
    mockedExtractUrl.mockReset();
    const database = getDatabase();
    database.$client.exec(
      "DELETE FROM bookmark_tags; DELETE FROM bookmarks; DELETE FROM tags;",
    );
  });

  afterAll(() => {
    closeDatabase();
    if (previousDatabasePath === undefined) {
      delete process.env.DATABASE_PATH;
    } else {
      process.env.DATABASE_PATH = previousDatabasePath;
    }
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  });

  it("抓取失败时仍保留 failed 书签、标签和错误信息", async () => {
    mockedExtractUrl.mockResolvedValueOnce(failedExtraction);

    const created = await createBookmark({
      url: "https://example.com/article",
      tagNames: ["失败保留"],
    });

    expect(created.extractionStatus).toBe("failed");
    expect(created.errorCode).toBe("REQUEST_TIMEOUT");
    expect(created.tags.map((tag) => tag.name)).toEqual(["失败保留"]);
    await expect(getBookmarkById(created.id)).resolves.toMatchObject({
      id: created.id,
      normalizedUrl: "https://example.com/article",
      extractionStatus: "failed",
    });
  });

  it("手改 Markdown 未确认时拒绝重提取，失败重试仍保留手改正文", async () => {
    mockedExtractUrl.mockResolvedValueOnce(successfulExtraction);
    const created = await createBookmark({
      url: "https://example.com/article",
      tagNames: ["保留标签"],
    });
    const edited = await updateBookmark(created.id, {
      title: "用户自定义标题",
      userNote: "保留备注",
      markdownContent: "# 用户手写正文\n\n不可静默覆盖。",
    });
    expect(edited.isContentEdited).toBe(true);

    await expect(reExtractBookmark(created.id, false)).rejects.toMatchObject({
      code: "CONTENT_EDITED",
    });
    expect(mockedExtractUrl).toHaveBeenCalledTimes(1);

    mockedExtractUrl.mockResolvedValueOnce(failedExtraction);
    const retried = await reExtractBookmark(created.id, true);
    expect(retried.title).toBe("用户自定义标题");
    expect(retried.markdownContent).toContain("用户手写正文");
    expect(retried.userNote).toBe("保留备注");
    expect(retried.tags.map((tag) => tag.name)).toEqual(["保留标签"]);
    expect(retried.isContentEdited).toBe(true);
    expect(retried.extractionStatus).toBe("failed");
  });

  it("未手改正文时重提取失败也保留上一次可读内容", async () => {
    mockedExtractUrl.mockResolvedValueOnce(successfulExtraction);
    const created = await createBookmark({
      url: "https://example.com/article",
    });

    mockedExtractUrl.mockResolvedValueOnce(failedExtraction);
    const retried = await reExtractBookmark(created.id, false);

    expect(retried.extractionStatus).toBe("failed");
    expect(retried.markdownContent).toBe(created.markdownContent);
    expect(retried.contentLength).toBe(created.contentLength);
  });

  it("只修改备注和标签不会误标正文为手动编辑", async () => {
    mockedExtractUrl.mockResolvedValueOnce(successfulExtraction);
    const created = await createBookmark({
      url: "https://example.com/article",
    });

    const updated = await updateBookmark(created.id, {
      userNote: "仅修改备注",
      markdownContent: created.markdownContent,
      tagNames: ["阅读"],
    });

    expect(updated.isContentEdited).toBe(false);
  });

  it("部分提取保留现有标题，成功提取才更新自动标题", async () => {
    mockedExtractUrl.mockResolvedValueOnce(successfulExtraction);
    const created = await createBookmark({
      url: "https://example.com/article",
    });
    await updateBookmark(created.id, {
      title: "用户自定义标题",
    });

    mockedExtractUrl.mockResolvedValueOnce({
      ...successfulExtraction,
      title: "部分提取标题",
      status: "partial",
      errorCode: "CONTENT_TOO_SHORT",
      errorMessage: "未识别到足够的正文内容",
    });
    const partial = await reExtractBookmark(created.id, false);
    expect(partial.title).toBe("用户自定义标题");
    expect(partial.extractionStatus).toBe("partial");

    mockedExtractUrl.mockResolvedValueOnce({
      ...successfulExtraction,
      title: "成功更新的自动标题",
    });
    const succeeded = await reExtractBookmark(created.id, false);
    expect(succeeded.title).toBe("成功更新的自动标题");
    expect(succeeded.extractionStatus).toBe("success");
  });

  it("删除进入撤销窗口，正文与本地化图片在此期间保留", async () => {
    mockedExtractUrl.mockResolvedValueOnce(successfulExtraction);
    const created = await createBookmark({
      url: "https://example.com/delete-with-assets",
      tagNames: ["待删除"],
    });
    const assetDirectory = resolveBookmarkAssetDirectory(created.id);
    fs.mkdirSync(assetDirectory, { recursive: true });
    fs.writeFileSync(
      path.join(assetDirectory, "0123456789abcdef01234567.png"),
      "asset",
    );

    expect(deleteBookmark(created.id)).toBe(true);
    await expect(getBookmarkById(created.id)).resolves.toBeNull();
    expect(fs.existsSync(assetDirectory)).toBe(true);

    const restored = await restoreBookmark(created.id);
    expect(restored?.id).toBe(created.id);
    expect(restored?.tags.map((tag) => tag.name)).toEqual(["待删除"]);
  });

  it("撤销窗口过期后彻底清理数据库关联和本地化图片", async () => {
    mockedExtractUrl.mockResolvedValueOnce(successfulExtraction);
    const created = await createBookmark({
      url: "https://example.com/delete-then-purge",
      tagNames: ["待清理"],
    });
    const assetDirectory = resolveBookmarkAssetDirectory(created.id);
    fs.mkdirSync(assetDirectory, { recursive: true });
    fs.writeFileSync(
      path.join(assetDirectory, "0123456789abcdef01234567.png"),
      "asset",
    );

    expect(deleteBookmark(created.id)).toBe(true);
    expect(purgeExpiredBookmarks()).toBe(0);
    expect(fs.existsSync(assetDirectory)).toBe(true);

    // 把「现在」推到保留期之后，等价于撤销窗口已经过期。
    expect(purgeExpiredBookmarks(new Date(Date.now() + 11 * 60 * 1000))).toBe(
      1,
    );
    expect(fs.existsSync(assetDirectory)).toBe(false);
    await expect(restoreBookmark(created.id)).resolves.toBeNull();

    const relation = getDatabase()
      .$client.prepare(
        "SELECT COUNT(*) AS count FROM bookmark_tags WHERE bookmark_id = ?",
      )
      .get(created.id) as { count: number };
    expect(relation.count).toBe(0);
  });

  it("撤销窗口内重新收藏同一网址会清掉旧记录而不是报重复", async () => {
    mockedExtractUrl.mockResolvedValueOnce(successfulExtraction);
    const created = await createBookmark({
      url: "https://example.com/delete-then-recreate",
    });
    expect(deleteBookmark(created.id)).toBe(true);

    mockedExtractUrl.mockResolvedValueOnce(successfulExtraction);
    const recreated = await createBookmark({
      url: "https://example.com/delete-then-recreate",
    });
    expect(recreated.id).not.toBe(created.id);
    await expect(restoreBookmark(created.id)).resolves.toBeNull();
  });
});
