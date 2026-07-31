import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  closeDatabase,
  createDatabase,
  getDatabase,
} from "@/db/client";
import {
  deleteTag,
  getBookmarkById,
  getOrCreateTag,
  hardDeleteBookmark,
  insertBookmark,
  listBookmarks,
  listDeletedBookmarkIdsBefore,
  listTags,
  normalizeTagName,
  restoreBookmark,
  setBookmarkTags,
  softDeleteBookmark,
  updateBookmarkRecord,
  updateTag,
} from "@/db/repository";

describe("SQLite Repository 与持久化", () => {
  let tempDirectory: string;
  let databasePath: string;
  let firstId: string;
  let secondId: string;

  beforeAll(() => {
    tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "url-bookmark-test-"));
    databasePath = path.join(tempDirectory, "bookmarks.db");
    process.env.DATABASE_PATH = databasePath;
    const database = createDatabase(databasePath);
    migrate(database, {
      migrationsFolder: path.resolve(process.cwd(), "drizzle"),
    });
    database.$client.close();

    const now = new Date();
    firstId = randomUUID();
    secondId = randomUUID();
    insertBookmark({
      id: firstId,
      url: "https://example.com/guide",
      normalizedUrl: "https://example.com/guide",
      finalUrl: "https://cdn.example.net/resolved-path",
      title: "中文测试指南",
      domain: "example.com",
      markdownContent: "这是一段关于可靠提取流程的正文内容。",
      plainText: "这是一段关于可靠提取流程的正文内容。",
      userNote: "重要资料",
      extractionStatus: "success",
      createdAt: now,
      updatedAt: now,
    });
    insertBookmark({
      id: secondId,
      url: "https://docs.example.org/fetch",
      normalizedUrl: "https://docs.example.org/fetch",
      finalUrl: "https://docs.example.org/fetch",
      title: "Fetch API Notes",
      domain: "docs.example.org",
      markdownContent: "AbortSignal and redirect validation.",
      plainText: "AbortSignal and redirect validation.",
      extractionStatus: "partial",
      createdAt: new Date(now.getTime() + 1_000),
      updatedAt: new Date(now.getTime() + 1_000),
    });
    setBookmarkTags(firstId, [" 技术文章 ", "阅读"]);
    setBookmarkTags(secondId, ["TECH", "阅读"]);
  });

  afterAll(() => {
    closeDatabase();
    delete process.env.DATABASE_PATH;
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  });

  it("规范化标签并忽略大小写去重", () => {
    expect(normalizeTagName("  JavaScript  ")).toEqual({
      name: "JavaScript",
      normalizedName: "javascript",
    });
    const tags = listTags();
    expect(tags).toHaveLength(3);
    expect(tags.find((tag) => tag.name === "阅读")?.bookmarkCount).toBe(2);
  });

  it.each([
    ["中文测试指南", "first", "标题"],
    ["/guide", "first", "原始 URL"],
    ["resolved-path", "first", "最终 URL"],
    ["docs.example.org", "second", "域名"],
    ["可靠提取", "first", "Markdown 正文"],
    ["重要资料", "first", "用户备注"],
    ["TECH", "second", "标签名称"],
  ])("可以搜索 %s", async (keyword, expectedRecord) => {
    const result = await listBookmarks({ q: keyword });
    const expectedId = expectedRecord === "first" ? firstId : secondId;
    expect(result.items.map((item) => item.id)).toContain(expectedId);
  });

  it("组合关键词与标签筛选", async () => {
    const readingTag = listTags().find((tag) => tag.name === "阅读");
    expect(readingTag).toBeTruthy();
    const result = await listBookmarks({
      q: "中文",
      tagId: readingTag?.id,
      status: "success",
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe(firstId);
  });

  it("修改后搜索结果同步", async () => {
    updateBookmarkRecord(firstId, {
      markdownContent: "更新后的独特关键词：星图工作流",
      plainText: "更新后的独特关键词：星图工作流",
      isContentEdited: true,
    });
    const result = await listBookmarks({ q: "星图工作流" });
    expect(result.items[0].id).toBe(firstId);
  });

  it("超过 50 条时可通过后续分页访问", async () => {
    const createdAt = Date.now() + 10_000;
    for (let index = 0; index < 55; index += 1) {
      insertBookmark({
        id: randomUUID(),
        url: `https://pagination.example.com/article-${index}`,
        normalizedUrl: `https://pagination.example.com/article-${index}`,
        finalUrl: `https://pagination.example.com/article-${index}`,
        title: `分页样本 ${String(index).padStart(2, "0")}`,
        domain: "pagination.example.com",
        plainText: "用于验证加载更多的分页样本",
        extractionStatus: "success",
        createdAt: new Date(createdAt + index),
        updatedAt: new Date(createdAt + index),
      });
    }

    const firstPage = await listBookmarks({
      q: "分页样本",
      page: 1,
      pageSize: 50,
    });
    const secondPage = await listBookmarks({
      q: "分页样本",
      page: 2,
      pageSize: 50,
    });

    expect(firstPage.total).toBe(55);
    expect(firstPage.items).toHaveLength(50);
    expect(secondPage.items).toHaveLength(5);
    expect(
      new Set([...firstPage.items, ...secondPage.items].map((item) => item.id))
        .size,
    ).toBe(55);
  });

  it("重命名、计数并删除标签", () => {
    const created = getOrCreateTag("待整理");
    expect(listTags().find((tag) => tag.id === created.id)?.bookmarkCount).toBe(
      0,
    );

    const renamed = updateTag(created.id, "已整理");
    expect(renamed.name).toBe("已整理");
    expect(listTags().find((tag) => tag.id === created.id)).toMatchObject({
      name: "已整理",
      bookmarkCount: 0,
    });

    expect(deleteTag(created.id)).toBe(true);
    expect(listTags().some((tag) => tag.id === created.id)).toBe(false);
  });

  it("数据库唯一约束冲突映射为 DUPLICATE_URL", () => {
    let caught: unknown;
    try {
      insertBookmark({
        id: randomUUID(),
        url: "https://example.com/guide#duplicate",
        normalizedUrl: "https://example.com/guide",
        finalUrl: "https://example.com/guide",
        title: "并发重复收藏",
        domain: "example.com",
        extractionStatus: "pending",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toMatchObject({
      code: "DUPLICATE_URL",
      status: 409,
    });
  });

  it("关闭并重新打开连接后数据仍然存在", async () => {
    closeDatabase();
    expect(fs.existsSync(databasePath)).toBe(true);
    getDatabase();
    const record = await getBookmarkById(firstId);
    expect(record?.title).toBe("中文测试指南");
    expect(record?.tags).toHaveLength(2);
  });

  it("软删除后书签对查询不可见，但仍可恢复", async () => {
    expect(softDeleteBookmark(secondId)).toBe(true);
    expect(await getBookmarkById(secondId)).toBeNull();
    expect(
      (await getBookmarkById(secondId, { includeDeleted: true }))?.deletedAt,
    ).toBeInstanceOf(Date);
    const list = await listBookmarks({});
    expect(list.items.some((item) => item.id === secondId)).toBe(false);
    expect(listTags().find((tag) => tag.name === "阅读")?.bookmarkCount).toBe(1);

    expect(restoreBookmark(secondId)).toBe(true);
    expect((await getBookmarkById(secondId))?.id).toBe(secondId);
    expect(listTags().find((tag) => tag.name === "阅读")?.bookmarkCount).toBe(2);
  });

  it("按删除时间筛选出过期记录，硬删除时级联清理标签关系", async () => {
    expect(softDeleteBookmark(secondId)).toBe(true);
    expect(listDeletedBookmarkIdsBefore(new Date(Date.now() - 60_000))).toEqual(
      [],
    );
    expect(
      listDeletedBookmarkIdsBefore(new Date(Date.now() + 60_000)),
    ).toEqual([secondId]);

    expect(hardDeleteBookmark(secondId)).toBe(true);
    expect(
      await getBookmarkById(secondId, { includeDeleted: true }),
    ).toBeNull();
    expect(listTags().find((tag) => tag.name === "阅读")?.bookmarkCount).toBe(1);
  });
});
