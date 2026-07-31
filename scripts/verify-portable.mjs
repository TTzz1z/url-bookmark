import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const packageDirectory = path.resolve(
  process.argv[2] ||
    path.join(projectRoot, "release", "url-bookmark-v1.0.0-win-x64"),
);
const port = Number(process.argv[3] || 3217);
const packageNode = path.join(packageDirectory, "runtime", "node.exe");
const serverEntry = path.join(packageDirectory, "server.js");
const databasePath = path.join(packageDirectory, "data", "bookmarks.db");

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
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline && child.exitCode === null) {
    try {
      const response = await fetch(`${url}/api/health`, {
        signal: AbortSignal.timeout(2_000),
      });
      if (response.ok) {
        return response;
      }
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return null;
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
  if (child.exitCode === null) {
    child.kill("SIGKILL");
    await exited;
  }
}

async function main() {
  assert(
    process.platform === "win32",
    "Portable verification requires Windows.",
  );
  assert(Number.isInteger(port) && port > 0 && port <= 65535, "Invalid port.");
  assert(
    fs.existsSync(packageNode),
    `Missing packaged Node.js: ${packageNode}`,
  );
  assert(
    fs.existsSync(serverEntry),
    `Missing standalone server: ${serverEntry}`,
  );
  assert(await portIsAvailable(port), `Verification port ${port} is in use.`);
  assert(
    !fs.existsSync(databasePath),
    "The package must start without a database.",
  );

  const url = `http://127.0.0.1:${port}`;
  const output = [];
  const errors = [];
  const child = spawn(packageNode, [serverEntry], {
    cwd: packageDirectory,
    env: {
      ...process.env,
      DATABASE_PATH: databasePath,
      HOSTNAME: "127.0.0.1",
      MIGRATIONS_PATH: path.join(packageDirectory, "drizzle"),
      NEXT_TELEMETRY_DISABLED: "1",
      NODE_ENV: "production",
      PORT: String(port),
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  child.stdout.on("data", (chunk) => output.push(String(chunk)));
  child.stderr.on("data", (chunk) => errors.push(String(chunk)));

  try {
    const healthResponse = await waitForReady(child, url);
    assert(
      healthResponse,
      `Server did not become ready.\n${output.join("")}\n${errors.join("")}`,
    );
    const health = await healthResponse.json();
    const [homeResponse, storageResponse, bookmarksResponse] =
      await Promise.all([
        fetch(url, { signal: AbortSignal.timeout(10_000) }),
        fetch(`${url}/api/storage`, { signal: AbortSignal.timeout(10_000) }),
        fetch(`${url}/api/bookmarks`, { signal: AbortSignal.timeout(10_000) }),
      ]);
    const storageBody = await storageResponse.text();
    const bookmarksBody = await bookmarksResponse.text();
    assert(homeResponse.ok, `Home page returned ${homeResponse.status}.`);
    assert(
      storageResponse.ok,
      `Storage API returned ${storageResponse.status}: ${storageBody}\n${output.join("")}\n${errors.join("")}`,
    );
    assert(
      bookmarksResponse.ok,
      `Bookmarks API returned ${bookmarksResponse.status}: ${bookmarksBody}\n${output.join("")}\n${errors.join("")}`,
    );

    const storage = JSON.parse(storageBody);
    const bookmarks = JSON.parse(bookmarksBody);
    assert(health.status === "ok", "Health response was not ok.");
    assert(storage.databaseBytes > 0, "The migrated database is empty.");
    assert(bookmarks.total === 0, "A fresh package contains bookmarks.");
  } finally {
    await stopChild(child);
  }

  assert(await portIsAvailable(port), "The verification server did not stop.");
  assert(
    fs.existsSync(databasePath),
    "Automatic migration did not create the database.",
  );

  const requireFromPackage = createRequire(
    path.join(packageDirectory, "package.json"),
  );
  const Database = requireFromPackage("better-sqlite3");
  const database = new Database(databasePath, { readonly: true });
  try {
    const integrity = database.pragma("integrity_check", { simple: true });
    const bookmarkCount = database
      .prepare("SELECT COUNT(*) AS count FROM bookmarks")
      .get().count;
    const tagCount = database
      .prepare("SELECT COUNT(*) AS count FROM tags")
      .get().count;
    const migrationCount = database
      .prepare("SELECT COUNT(*) AS count FROM __drizzle_migrations")
      .get().count;
    assert(integrity === "ok", `SQLite integrity check failed: ${integrity}`);
    assert(
      bookmarkCount === 0 && tagCount === 0,
      "Fresh database is not empty.",
    );
    assert(
      migrationCount >= 2,
      "Expected database migrations were not applied.",
    );
    console.log(
      JSON.stringify(
        {
          packageDirectory,
          port,
          health: "ok",
          home: "ok",
          storage: "ok",
          sqliteIntegrity: integrity,
          migrations: migrationCount,
          bookmarks: bookmarkCount,
          tags: tagCount,
        },
        null,
        2,
      ),
    );
  } finally {
    database.close();
  }

  if (errors.join("").trim()) {
    throw new Error(`Portable server wrote to stderr:\n${errors.join("")}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
