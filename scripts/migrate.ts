import { migrateDatabase } from "../src/db/migrations";

try {
  const { databasePath } = migrateDatabase();
  console.log(`数据库已就绪：${databasePath}`);
} catch (error) {
  console.error(
    "数据库初始化失败：",
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
}
