import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createDatabase, resolveDatabasePath } from "../src/db/client";

const databasePath = resolveDatabasePath();
const database = createDatabase(databasePath);

try {
  migrate(database, {
    migrationsFolder: path.resolve(process.cwd(), "drizzle"),
  });
  console.log(`数据库已就绪：${databasePath}`);
} catch (error) {
  console.error(
    "数据库初始化失败：",
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
} finally {
  database.$client.close();
}
