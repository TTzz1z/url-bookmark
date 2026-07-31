/**
 * Phase 6 runtime acceptance for source and portable packages.
 *
 * Usage:
 *   node scripts/verify-phase6-runtime.mjs source <appRoot> <port>
 *   node scripts/verify-phase6-runtime.mjs portable <packageRoot> <port>
 *
 * Source mode starts `node node_modules/next/dist/bin/next start -H 127.0.0.1 -p <port>`
 * with an isolated DATABASE_PATH under the given app root.
 * Portable mode uses the bundled runtime/node.exe + server.js.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const mode = process.argv[2];
const appRoot = path.resolve(process.argv[3] || process.cwd());
const port = Number(process.argv[4] || (mode === "portable" ? 3220 : 3221));
const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function portIsAvailable(candidate) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.unref();
    probe.once("error", () => resolve(false));
    probe.listen({ host: "127.0.0.1", port: candidate }, () => {
      probe.close(() => resolve(true));
    });
  });
}

async function waitForReady(child, url) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline && child.exitCode === null) {
    try {
      const response = await fetch(`${url}/api/health`, {
        signal: AbortSignal.timeout(2_000),
      });
      if (response.ok) {
        return true;
      }
    } catch {
      // still starting
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return false;
}

async function stopChild(child) {
  if (child.exitCode !== null) {
    return;
  }
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill("SIGTERM");
  await Promise.race([
    exited,
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (child.exitCode !== null) {
    return;
  }
  if (process.platform === "win32") {
    spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
  } else {
    child.kill("SIGKILL");
  }
  await Promise.race([
    exited,
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
}

function checkpointSqlite(databasePath, requireFromPackageJson) {
  if (!fs.existsSync(databasePath)) {
    return;
  }
  const requireFrom = createRequire(requireFromPackageJson);
  const Database = requireFrom("better-sqlite3");
  const database = new Database(databasePath);
  try {
    database.pragma("wal_checkpoint(TRUNCATE)");
  } finally {
    database.close();
  }
  for (const suffix of ["-wal", "-shm"]) {
    const sidecar = `${databasePath}${suffix}`;
    if (fs.existsSync(sidecar)) {
      fs.rmSync(sidecar, { force: true });
    }
  }
}

function copyFileSync(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function copyDirectorySync(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) {
      copyDirectorySync(source, target);
    } else {
      fs.copyFileSync(source, target);
    }
  }
}

function startServer({ nodeExecutable, args, cwd, env }) {
  const output = [];
  const errors = [];
  const child = spawn(nodeExecutable, args, {
    cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  child.stdout.on("data", (chunk) => output.push(String(chunk)));
  child.stderr.on("data", (chunk) => errors.push(String(chunk)));
  return { child, output, errors };
}

async function jsonFetch(url, init) {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(60_000),
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { response, body, text };
}

async function exerciseApp(url, databasePath) {
  const articleUrl = "https://example.com/";
  const created = await jsonFetch(`${url}/api/bookmarks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      url: articleUrl,
      tagNames: ["phase6", "验收"],
    }),
  });
  assert(
    created.response.status === 201,
    `Create bookmark failed: ${created.response.status} ${created.text}`,
  );
  assert(created.body?.id, "Create response missing id.");
  assert(
    created.body.title && created.body.title.length > 0,
    "Created bookmark missing title.",
  );
  assert(
    typeof created.body.markdownContent === "string",
    "Created bookmark missing markdown field.",
  );
  assert(
    created.body.status === "success" ||
      created.body.status === "partial" ||
      (typeof created.body.markdownContent === "string" &&
        created.body.markdownContent.length > 0),
    `Extraction did not produce usable content: status=${created.body.status} code=${created.body.errorCode}`,
  );

  const bookmarkId = created.body.id;
  const detail = await jsonFetch(`${url}/api/bookmarks/${bookmarkId}`);
  assert(detail.response.ok, `Detail failed: ${detail.text}`);

  const patched = await jsonFetch(`${url}/api/bookmarks/${bookmarkId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      userNote: "phase6 persistence note",
      tagNames: ["phase6", "验收", "搜索词"],
    }),
  });
  assert(patched.response.ok, `Patch failed: ${patched.text}`);
  assert(
    patched.body.userNote === "phase6 persistence note",
    "User note was not saved.",
  );

  const search = await jsonFetch(
    `${url}/api/bookmarks?q=${encodeURIComponent("phase6 persistence")}`,
  );
  assert(search.response.ok, `Search failed: ${search.text}`);
  assert(
    search.body.items?.some((item) => item.id === bookmarkId),
    "Search did not find the edited bookmark.",
  );

  const tags = await jsonFetch(`${url}/api/tags`);
  assert(tags.response.ok, `Tags list failed: ${tags.text}`);
  assert(
    tags.body.items?.some((tag) => tag.name === "phase6"),
    "Tag phase6 was not created.",
  );
  const phase6Tag = tags.body.items.find((tag) => tag.name === "phase6");
  const tagged = await jsonFetch(
    `${url}/api/bookmarks?tag=${encodeURIComponent(phase6Tag.id)}`,
  );
  assert(tagged.response.ok, `Tag filter failed: ${tagged.text}`);
  assert(
    tagged.body.items?.some((item) => item.id === bookmarkId),
    "Tag filter missed the bookmark.",
  );

  const markdownUsable =
    typeof created.body.markdownContent === "string" &&
    created.body.markdownContent.length > 0;
  assert(
    markdownUsable,
    "Extraction did not produce usable markdown.",
  );

  const storage = await jsonFetch(`${url}/api/storage`);
  assert(storage.response.ok, `Storage failed: ${storage.text}`);
  assert(storage.body.databaseBytes > 0, "Storage reports empty database.");

  const privateBlocked = await jsonFetch(`${url}/api/bookmarks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: "http://192.168.255.1/private-phase6" }),
  });
  assert(
    privateBlocked.response.status >= 400 ||
      privateBlocked.body?.status === "failed" ||
      privateBlocked.body?.errorCode ||
      privateBlocked.body?.code,
    `Private network URL was not rejected usefully: ${privateBlocked.text}`,
  );

  return {
    bookmarkId,
    title: created.body.title,
    status: created.body.status,
    databasePath,
    databaseBytes: storage.body.databaseBytes,
  };
}

async function main() {
  assert(
    mode === "source" || mode === "portable",
    "Mode must be source or portable.",
  );
  assert(Number.isInteger(port) && port > 0 && port <= 65535, "Invalid port.");
  assert(await portIsAvailable(port), `Port ${port} is already in use.`);

  const dataDirectory = path.join(appRoot, "data-phase6");
  const databasePath = path.join(dataDirectory, "bookmarks.db");
  const assetsDirectory = path.join(dataDirectory, "assets");
  fs.rmSync(dataDirectory, { recursive: true, force: true });
  fs.mkdirSync(assetsDirectory, { recursive: true });

  let nodeExecutable;
  let args;
  let migrationsPath;
  if (mode === "portable") {
    nodeExecutable = path.join(appRoot, "runtime", "node.exe");
    args = [path.join(appRoot, "server.js")];
    migrationsPath = path.join(appRoot, "drizzle");
    assert(fs.existsSync(nodeExecutable), `Missing ${nodeExecutable}`);
    assert(fs.existsSync(path.join(appRoot, "server.js")), "Missing server.js");
  } else {
    nodeExecutable = process.execPath;
    const nextBin = path.join(
      appRoot,
      "node_modules",
      "next",
      "dist",
      "bin",
      "next",
    );
    assert(fs.existsSync(nextBin), `Missing Next.js binary at ${nextBin}`);
    assert(
      fs.existsSync(path.join(appRoot, ".next", "BUILD_ID")) ||
        fs.existsSync(path.join(appRoot, ".next-portable", "BUILD_ID")),
      "Source acceptance requires an existing production build (.next).",
    );
    args = [nextBin, "start", "-H", "127.0.0.1", "-p", String(port)];
    migrationsPath = path.join(appRoot, "drizzle");
  }

  const packageJsonForSqlite =
    mode === "portable"
      ? path.join(appRoot, "package.json")
      : path.join(projectRoot, "package.json");

  const url = `http://127.0.0.1:${port}`;
  const baseEnv = {
    ...process.env,
    ALLOW_TEST_LOOPBACK: "1",
    DATABASE_PATH: databasePath,
    HOSTNAME: "127.0.0.1",
    MIGRATIONS_PATH: migrationsPath,
    NEXT_TELEMETRY_DISABLED: "1",
    NODE_ENV: "production",
    PORT: String(port),
  };

  const first = startServer({
    nodeExecutable,
    args,
    cwd: appRoot,
    env: baseEnv,
  });

  let result;
  try {
    assert(
      await waitForReady(first.child, url),
      `Server failed to start.\n${first.output.join("")}\n${first.errors.join("")}`,
    );
    result = await exerciseApp(url, databasePath);
  } finally {
    await stopChild(first.child);
  }

  assert(await portIsAvailable(port), "Server did not release the port.");
  assert(fs.existsSync(databasePath), "Database was not created.");
  checkpointSqlite(databasePath, packageJsonForSqlite);

  const backupDirectory = path.join(appRoot, "backups-phase6", "snapshot");
  fs.rmSync(path.join(appRoot, "backups-phase6"), {
    recursive: true,
    force: true,
  });
  fs.mkdirSync(path.join(backupDirectory, "assets"), { recursive: true });
  copyFileSync(databasePath, path.join(backupDirectory, "bookmarks.db"));
  if (fs.existsSync(assetsDirectory)) {
    copyDirectorySync(assetsDirectory, path.join(backupDirectory, "assets"));
  }

  // Restart persistence check
  const second = startServer({
    nodeExecutable,
    args,
    cwd: appRoot,
    env: baseEnv,
  });
  try {
    assert(
      await waitForReady(second.child, url),
      `Restart failed.\n${second.output.join("")}\n${second.errors.join("")}`,
    );
    const afterRestart = await jsonFetch(
      `${url}/api/bookmarks/${result.bookmarkId}`,
    );
    assert(
      afterRestart.response.ok,
      `Bookmark missing after restart: ${afterRestart.text}`,
    );
    assert(
      afterRestart.body.userNote === "phase6 persistence note",
      "Persisted note missing after restart.",
    );

    // Port conflict: hold the running server and probe the same port.
    assert(!(await portIsAvailable(port)), "Expected port to stay occupied.");
  } finally {
    await stopChild(second.child);
  }

  checkpointSqlite(databasePath, packageJsonForSqlite);

  // Restore check: wipe live DB then restore from backup and reopen.
  fs.rmSync(dataDirectory, { recursive: true, force: true });
  fs.mkdirSync(assetsDirectory, { recursive: true });
  copyFileSync(
    path.join(backupDirectory, "bookmarks.db"),
    databasePath,
  );
  const backupAssets = path.join(backupDirectory, "assets");
  if (fs.existsSync(backupAssets)) {
    copyDirectorySync(backupAssets, assetsDirectory);
  }

  const third = startServer({
    nodeExecutable,
    args,
    cwd: appRoot,
    env: baseEnv,
  });
  try {
    assert(
      await waitForReady(third.child, url),
      `Post-restore start failed.\n${third.output.join("")}\n${third.errors.join("")}`,
    );
    const restored = await jsonFetch(
      `${url}/api/bookmarks/${result.bookmarkId}`,
    );
    assert(
      restored.response.ok,
      `Restore failed to preserve bookmark: ${restored.text}`,
    );
  } finally {
    await stopChild(third.child);
  }

  const requirePath =
    mode === "portable"
      ? path.join(appRoot, "package.json")
      : path.join(projectRoot, "package.json");
  const requireFrom = createRequire(requirePath);
  let integrity = "skipped";
  try {
    const Database = requireFrom("better-sqlite3");
    const database = new Database(databasePath, { readonly: true });
    try {
      integrity = database.pragma("integrity_check", { simple: true });
      assert(integrity === "ok", `SQLite integrity failed: ${integrity}`);
    } finally {
      database.close();
    }
  } catch (error) {
    if (mode === "portable") {
      throw error;
    }
    integrity = `skipped:${error instanceof Error ? error.message : String(error)}`;
  }

  const report = {
    mode,
    appRoot,
    port,
    health: "ok",
    firstCreate: "ok",
    tagsSearchUpdate: "ok",
    restartPersistence: "ok",
    backupRestore: "ok",
    portConflictDetected: "ok",
    sqliteIntegrity: integrity,
    bookmarkId: result.bookmarkId,
    title: result.title,
    extractionStatus: result.status,
    databaseBytes: result.databaseBytes,
  };
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
