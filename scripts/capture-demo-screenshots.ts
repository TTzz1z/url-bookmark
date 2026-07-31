/**
 * Capture README/demo screenshots against seeded demo data.
 * Usage: npx tsx scripts/capture-demo-screenshots.ts [baseUrl]
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const baseURL = process.argv[2] || "http://127.0.0.1:3330";
const outDir = path.resolve(process.cwd(), "demo/screenshots");
fs.mkdirSync(outDir, { recursive: true });

async function waitReady() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseURL}/api/health`, {
        signal: AbortSignal.timeout(2000),
      });
      if (response.ok) return;
    } catch {
      // starting
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`Server not ready at ${baseURL}`);
}

async function main() {
  await waitReady();
  const list = await fetch(`${baseURL}/api/bookmarks?pageSize=1`).then((r) =>
    r.json(),
  );
  const firstId = list.items?.[0]?.id;
  if (!firstId) {
    throw new Error("Demo database has no bookmarks to capture.");
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
  });

  await page.goto(`${baseURL}/`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "全部收藏" }).waitFor();
  await page.getByTestId("bookmark-card").first().waitFor();
  await page.screenshot({
    path: path.join(outDir, "home.png"),
    fullPage: false,
  });

  await page.getByLabel("搜索收藏").fill("星图工作流");
  await page.waitForTimeout(700);
  await page.screenshot({
    path: path.join(outDir, "search.png"),
    fullPage: false,
  });

  await page.goto(`${baseURL}/`, { waitUntil: "networkidle" });
  const securityTag = page.locator("button, a").filter({ hasText: /^安全/ });
  if ((await securityTag.count()) > 0) {
    await securityTag.first().click();
    await page.waitForTimeout(700);
    await page.screenshot({
      path: path.join(outDir, "tag-filter.png"),
      fullPage: false,
    });
  }

  await page.goto(`${baseURL}/?status=failed`, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  await page.screenshot({
    path: path.join(outDir, "failed.png"),
    fullPage: false,
  });

  await page.goto(`${baseURL}/bookmarks/${firstId}`, {
    waitUntil: "networkidle",
  });
  await page
    .locator("header")
    .getByRole("heading", { level: 1 })
    .waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1000);
  await page.screenshot({
    path: path.join(outDir, "detail.png"),
    fullPage: false,
  });

  await page.getByRole("tab", { name: "Markdown 源码" }).click();
  await page.waitForTimeout(500);
  await page.screenshot({
    path: path.join(outDir, "markdown.png"),
    fullPage: false,
  });

  await browser.close();
  console.log(
    JSON.stringify(
      {
        outDir,
        firstId,
        files: fs
          .readdirSync(outDir)
          .filter((name) => name.endsWith(".png"))
          .sort(),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
