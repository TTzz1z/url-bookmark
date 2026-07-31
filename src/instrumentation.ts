export async function register(): Promise<void> {
  if (
    process.env.NEXT_RUNTIME !== "nodejs" ||
    process.env.SKIP_DATABASE_MIGRATIONS === "1"
  ) {
    return;
  }

  const { migrateDatabase } = await import("./db/migrations");
  const { databasePath } = migrateDatabase();
  console.log(`[url-bookmark] SQLite 数据库已就绪：${databasePath}`);
}
