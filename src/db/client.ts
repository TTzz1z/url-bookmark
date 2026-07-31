import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

type AppDatabase = BetterSQLite3Database<typeof schema> & {
  $client: Database.Database;
};

const globalDatabase = globalThis as typeof globalThis & {
  __bookmarkDatabase?: AppDatabase;
  __bookmarkDatabasePath?: string;
};

export function resolveDatabasePath(): string {
  const configured = process.env.DATABASE_PATH?.trim() || "./data/bookmarks.db";
  return path.isAbsolute(configured)
    ? configured
    : path.resolve(
        /* turbopackIgnore: true */ process.cwd(),
        configured,
      );
}

export function createDatabase(databasePath = resolveDatabasePath()): AppDatabase {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const sqlite = new Database(databasePath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  return drizzle(sqlite, { schema }) as AppDatabase;
}

export function getDatabase(): AppDatabase {
  const databasePath = resolveDatabasePath();
  if (
    !globalDatabase.__bookmarkDatabase ||
    globalDatabase.__bookmarkDatabasePath !== databasePath
  ) {
    globalDatabase.__bookmarkDatabase?.$client.close();
    globalDatabase.__bookmarkDatabase = createDatabase(databasePath);
    globalDatabase.__bookmarkDatabasePath = databasePath;
  }
  return globalDatabase.__bookmarkDatabase;
}

export function closeDatabase(): void {
  globalDatabase.__bookmarkDatabase?.$client.close();
  globalDatabase.__bookmarkDatabase = undefined;
  globalDatabase.__bookmarkDatabasePath = undefined;
}
