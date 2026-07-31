import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createDatabase, resolveDatabasePath } from "./client";

export function resolveMigrationsPath(): string {
  const configured = process.env.MIGRATIONS_PATH?.trim() || "./drizzle";
  return path.isAbsolute(configured)
    ? configured
    : path.resolve(/* turbopackIgnore: true */ process.cwd(), configured);
}

export function migrateDatabase(): {
  databasePath: string;
  migrationsPath: string;
} {
  const databasePath = resolveDatabasePath();
  const migrationsPath = resolveMigrationsPath();
  const database = createDatabase(databasePath);

  try {
    migrate(database, { migrationsFolder: migrationsPath });
    return { databasePath, migrationsPath };
  } finally {
    database.$client.close();
  }
}
