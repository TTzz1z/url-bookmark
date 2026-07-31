import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { resolveDatabasePath } from "@/db/client";
import { apiErrorResponse } from "@/lib/api-response";
import { resolveAssetsRoot } from "@/services/image-localization-service";

export const runtime = "nodejs";

async function fileSize(target: string): Promise<number> {
  try {
    const stats = await fs.promises.stat(/* turbopackIgnore: true */ target);
    return stats.isFile() ? stats.size : 0;
  } catch {
    return 0;
  }
}

async function directorySize(target: string): Promise<number> {
  let total = 0;
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(/* turbopackIgnore: true */ target, {
      withFileTypes: true,
    });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const entryPath = path.join(/* turbopackIgnore: true */ target, entry.name);
    total += entry.isDirectory()
      ? await directorySize(entryPath)
      : await fileSize(entryPath);
  }
  return total;
}

export async function GET() {
  try {
    const databasePath = resolveDatabasePath();
    // SQLite 运行在 WAL 模式下，未 checkpoint 的数据仍在 -wal 中，需要一并计入。
    const [databaseBytes, walBytes, assetBytes] = await Promise.all([
      fileSize(databasePath),
      fileSize(`${databasePath}-wal`),
      directorySize(resolveAssetsRoot()),
    ]);
    return NextResponse.json({
      databasePath,
      databaseBytes: databaseBytes + walBytes,
      assetBytes,
      totalBytes: databaseBytes + walBytes + assetBytes,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
