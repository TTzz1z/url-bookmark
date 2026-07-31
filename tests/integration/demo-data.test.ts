import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDatabase } from "@/db/client";
import {
  clearDemoData,
  DEMO_BOOKMARKS,
  DEMO_TAGS,
  seedDemoData,
} from "@/db/demo-data";
import { bookmarks, bookmarkTags, tags } from "@/db/schema";

describe("演示数据初始化与安全清理", () => {
  let tempDirectory: string;
  let databasePath: string;

  beforeEach(() => {
    tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "url-bookmark-demo-"));
    databasePath = path.join(tempDirectory, "bookmarks.db");
    const database = createDatabase(databasePath);
    migrate(database, {
      migrationsFolder: path.resolve(process.cwd(), "drizzle"),
    });
    const now = new Date("2026-07-30T08:00:00.000Z");
    database
      .insert(bookmarks)
      .values({
        id: "ordinary-bookmark",
        url: "https://user.example/my-bookmark",
        normalizedUrl: "https://user.example/my-bookmark",
        finalUrl: "https://user.example/my-bookmark",
        title: "用户自己的收藏",
        domain: "user.example",
        markdownContent: "这条记录不能被演示脚本修改。",
        plainText: "这条记录不能被演示脚本修改。",
        extractionStatus: "success",
        createdAt: now,
        updatedAt: now,
      })
      .run();
    database
      .insert(tags)
      .values({
        id: "ordinary-reading-tag",
        name: "阅读",
        normalizedName: "阅读",
        createdAt: now,
        updatedAt: now,
      })
      .run();
    database
      .insert(bookmarkTags)
      .values({
        bookmarkId: "ordinary-bookmark",
        tagId: "ordinary-reading-tag",
        createdAt: now,
      })
      .run();
    database.$client.close();
  });

  afterEach(() => {
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  });

  it("重复初始化不产生重复记录，并复用用户已有的同名标签", () => {
    const referenceTime = new Date("2026-07-30T08:00:00.000Z");
    const first = seedDemoData(databasePath, referenceTime);
    const second = seedDemoData(databasePath, referenceTime);
    expect(first.bookmarksUpserted).toBe(DEMO_BOOKMARKS.length);
    expect(first.existingTagsReused).toBe(1);
    expect(second.bookmarksUpserted).toBe(DEMO_BOOKMARKS.length);

    const database = createDatabase(databasePath);
    const allBookmarks = database.select().from(bookmarks).all();
    expect(allBookmarks).toHaveLength(DEMO_BOOKMARKS.length + 1);
    expect(
      allBookmarks.filter((bookmark) => bookmark.id.startsWith("demo-bookmark-")),
    ).toHaveLength(DEMO_BOOKMARKS.length);
    expect(
      database
        .select()
        .from(tags)
        .where(eq(tags.normalizedName, "阅读"))
        .all(),
    ).toHaveLength(1);
    expect(
      database
        .select()
        .from(bookmarks)
        .where(eq(bookmarks.id, "ordinary-bookmark"))
        .get()?.title,
    ).toBe("用户自己的收藏");
    database.$client.close();
  });

  it("再次初始化会恢复被修改的演示记录", () => {
    seedDemoData(databasePath, new Date("2026-07-30T08:00:00.000Z"));
    const database = createDatabase(databasePath);
    database
      .update(bookmarks)
      .set({ title: "录屏中临时修改的标题" })
      .where(eq(bookmarks.id, DEMO_BOOKMARKS[0].id))
      .run();
    database.$client.close();

    seedDemoData(databasePath, new Date("2026-07-30T09:00:00.000Z"));
    const reopened = createDatabase(databasePath);
    expect(
      reopened
        .select()
        .from(bookmarks)
        .where(eq(bookmarks.id, DEMO_BOOKMARKS[0].id))
        .get()?.title,
    ).toBe(DEMO_BOOKMARKS[0].title);
    reopened.$client.close();
  });

  it("清理只删除演示记录，并保留用户书签和仍在使用的同名标签", () => {
    seedDemoData(databasePath, new Date("2026-07-30T08:00:00.000Z"));
    const sharedDemoTag = DEMO_TAGS.find((tag) => tag.name === "安全");
    expect(sharedDemoTag).toBeTruthy();
    const beforeClear = createDatabase(databasePath);
    beforeClear
      .insert(bookmarkTags)
      .values({
        bookmarkId: "ordinary-bookmark",
        tagId: sharedDemoTag!.id,
        createdAt: new Date("2026-07-30T08:05:00.000Z"),
      })
      .run();
    beforeClear.$client.close();

    const result = clearDemoData(databasePath);
    expect(result.bookmarksDeleted).toBe(DEMO_BOOKMARKS.length);
    expect(result.tagsRetained).toBe(1);

    const database = createDatabase(databasePath);
    expect(database.select().from(bookmarks).all()).toHaveLength(1);
    expect(
      database
        .select()
        .from(bookmarks)
        .where(eq(bookmarks.id, "ordinary-bookmark"))
        .get()?.title,
    ).toBe("用户自己的收藏");
    expect(
      database
        .select()
        .from(tags)
        .where(eq(tags.id, "ordinary-reading-tag"))
        .get()?.name,
    ).toBe("阅读");
    expect(
      database
        .select()
        .from(tags)
        .where(eq(tags.id, DEMO_TAGS[0].id))
        .get(),
    ).toBeUndefined();
    expect(
      database
        .select()
        .from(tags)
        .where(eq(tags.id, sharedDemoTag!.id))
        .get()?.name,
    ).toBe("安全");
    database.$client.close();
  });

  it("固定 ID 被普通数据占用时整体中止，不覆盖任何记录", () => {
    const database = createDatabase(databasePath);
    const now = new Date("2026-07-30T08:00:00.000Z");
    database
      .insert(bookmarks)
      .values({
        id: DEMO_BOOKMARKS[0].id,
        url: "https://user.example/conflict",
        normalizedUrl: "https://user.example/conflict",
        finalUrl: "https://user.example/conflict",
        title: "冲突但必须保留",
        domain: "user.example",
        extractionStatus: "success",
        createdAt: now,
        updatedAt: now,
      })
      .run();
    database.$client.close();

    expect(() => seedDemoData(databasePath, now)).toThrow(
      "演示数据安全检查未通过",
    );

    const reopened = createDatabase(databasePath);
    expect(reopened.select().from(bookmarks).all()).toHaveLength(2);
    expect(
      reopened
        .select()
        .from(bookmarks)
        .where(eq(bookmarks.id, DEMO_BOOKMARKS[0].id))
        .get()?.title,
    ).toBe("冲突但必须保留");
    reopened.$client.close();
  });
});
