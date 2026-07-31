import { eq } from "drizzle-orm";
import { createDatabase, resolveDatabasePath } from "../src/db/client";
import { bookmarks } from "../src/db/schema";

const database = createDatabase(resolveDatabasePath());
const id = `smoke-${Date.now()}`;
const now = new Date();

try {
  database.insert(bookmarks).values({
    id,
    url: "https://example.com/smoke",
    normalizedUrl: `https://example.com/smoke?run=${id}`,
    finalUrl: "https://example.com/smoke",
    title: "Database smoke test",
    domain: "example.com",
    createdAt: now,
    updatedAt: now,
  }).run();

  const row = database.select().from(bookmarks).where(eq(bookmarks.id, id)).get();
  if (!row) {
    throw new Error("无法读取刚写入的测试记录");
  }

  database
    .update(bookmarks)
    .set({ title: "Database smoke test updated", updatedAt: new Date() })
    .where(eq(bookmarks.id, id))
    .run();

  database.delete(bookmarks).where(eq(bookmarks.id, id)).run();
  console.log("数据库 CRUD 冒烟测试通过。");
} catch (error) {
  console.error(
    "数据库 CRUD 冒烟测试失败：",
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
} finally {
  database.$client.close();
}
