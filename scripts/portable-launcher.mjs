import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const applicationRoot = path.dirname(fileURLToPath(import.meta.url));
const nodeExecutable = path.join(applicationRoot, "runtime", "node.exe");
const serverEntry = path.join(applicationRoot, "server.js");
const defaultDatabasePath = path.join(applicationRoot, "data", "bookmarks.db");

function parsePort(value) {
  if (!value) {
    return null;
  }
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT 必须是 1 到 65535 之间的整数，当前值：${value}`);
  }
  return port;
}

function portIsAvailable(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.unref();
    probe.once("error", () => resolve(false));
    probe.listen({ host: "127.0.0.1", port }, () => {
      probe.close(() => resolve(true));
    });
  });
}

async function choosePort() {
  const requested = parsePort(process.env.PORT);
  if (requested !== null) {
    if (!(await portIsAvailable(requested))) {
      throw new Error(`指定端口 ${requested} 已被占用。`);
    }
    return requested;
  }

  for (let port = 3000; port <= 3010; port += 1) {
    if (await portIsAvailable(port)) {
      return port;
    }
  }
  throw new Error("3000 到 3010 端口均被占用，请先关闭旧实例或设置 PORT。");
}

function healthIsReady(url) {
  return new Promise((resolve) => {
    const request = http.get(url, { timeout: 1_000 }, (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });
    request.once("timeout", () => request.destroy());
    request.once("error", () => resolve(false));
  });
}

async function waitForHealth(child, url) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline && child.exitCode === null) {
    if (await healthIsReady(url)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return false;
}

function openBrowser(url) {
  if (process.env.NO_OPEN_BROWSER === "1") {
    return;
  }
  const browser = spawn("explorer.exe", [url], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  browser.unref();
}

async function main() {
  if (!fs.existsSync(nodeExecutable) || !fs.existsSync(serverEntry)) {
    throw new Error(
      "运行文件不完整，请重新解压发布包。缺少 runtime/node.exe 或 server.js。 ",
    );
  }

  fs.mkdirSync(path.join(applicationRoot, "data", "assets"), {
    recursive: true,
  });

  const port = await choosePort();
  const applicationUrl = `http://127.0.0.1:${port}`;
  const environment = {
    ...process.env,
    DATABASE_PATH: process.env.DATABASE_PATH || defaultDatabasePath,
    HOSTNAME: "127.0.0.1",
    MIGRATIONS_PATH:
      process.env.MIGRATIONS_PATH || path.join(applicationRoot, "drizzle"),
    NEXT_TELEMETRY_DISABLED: "1",
    NODE_ENV: "production",
    PORT: String(port),
  };

  console.log("网址收藏夹正在启动……");
  console.log(`访问地址：${applicationUrl}`);
  console.log(`数据位置：${environment.DATABASE_PATH}`);
  console.log("关闭此窗口或按 Ctrl+C 可停止服务。\n");

  const child = spawn(nodeExecutable, [serverEntry], {
    cwd: applicationRoot,
    env: environment,
    stdio: "inherit",
    windowsHide: false,
  });

  const ready = await waitForHealth(child, `${applicationUrl}/api/health`);
  if (ready) {
    console.log(`\n启动成功：${applicationUrl}`);
    openBrowser(applicationUrl);
  } else if (child.exitCode === null) {
    console.error(`\n启动超时，请手动访问 ${applicationUrl} 或检查上方日志。`);
  }

  await new Promise((resolve) => child.once("exit", resolve));
  process.exitCode = child.exitCode ?? 1;
}

main().catch((error) => {
  console.error(
    `[启动失败] ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
