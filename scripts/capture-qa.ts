import fs from "node:fs";
import path from "node:path";
import { chromium, type Page } from "@playwright/test";

const outputDirectory = path.resolve(process.cwd(), ".qa");
fs.mkdirSync(outputDirectory, { recursive: true });

const browserErrors: string[] = [];

type SeedBookmark = {
  id: string;
  title: string;
};

function watchPage(page: Page): void {
  page.on("pageerror", (error) => browserErrors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") {
      browserErrors.push(`console: ${message.text()}`);
    }
  });
}

async function resetQaData(): Promise<void> {
  const bookmarksResponse = await fetch(
    "http://127.0.0.1:3000/api/bookmarks?pageSize=100",
  );
  if (!bookmarksResponse.ok) {
    throw new Error("无法读取 QA 书签数据");
  }
  const bookmarks = (await bookmarksResponse.json()) as {
    items: Array<{ id: string }>;
  };
  for (const bookmark of bookmarks.items) {
    const response = await fetch(
      `http://127.0.0.1:3000/api/bookmarks/${bookmark.id}`,
      { method: "DELETE" },
    );
    if (!response.ok) {
      throw new Error(`无法清理 QA 书签 ${bookmark.id}`);
    }
  }

  const tagsResponse = await fetch("http://127.0.0.1:3000/api/tags");
  if (!tagsResponse.ok) {
    throw new Error("无法读取 QA 标签数据");
  }
  const tags = (await tagsResponse.json()) as {
    items: Array<{ id: string }>;
  };
  for (const tag of tags.items) {
    const response = await fetch(
      `http://127.0.0.1:3000/api/tags/${tag.id}`,
      { method: "DELETE" },
    );
    if (!response.ok) {
      throw new Error(`无法清理 QA 标签 ${tag.id}`);
    }
  }
}

async function seedQaData(): Promise<SeedBookmark> {
  await resetQaData();
  const createResponse = await fetch(
    "http://127.0.0.1:3000/api/bookmarks",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url: "http://127.0.0.1:3000/api/test-fixture/article",
      }),
    },
  );
  if (!createResponse.ok) {
    throw new Error(`创建 QA 书签失败：HTTP ${createResponse.status}`);
  }
  const created = (await createResponse.json()) as SeedBookmark;
  const updateResponse = await fetch(
    `http://127.0.0.1:3000/api/bookmarks/${created.id}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userNote: "最终独立验收的稳定本地演示数据。",
        tagNames: ["演示", "阅读"],
      }),
    },
  );
  if (!updateResponse.ok) {
    throw new Error(`更新 QA 书签失败：HTTP ${updateResponse.status}`);
  }
  return created;
}

async function assertRendered(page: Page, label: string): Promise<void> {
  const result = await page.evaluate(() => ({
    hasContent: document.body.innerText.trim().length > 0,
    hasErrorOverlay: Boolean(
      document.querySelector(
        "[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay",
      ),
    ),
    hasHorizontalOverflow:
      document.documentElement.scrollWidth > window.innerWidth,
  }));
  if (!result.hasContent || result.hasErrorOverlay) {
    throw new Error(`${label} 页面为空或存在框架错误覆盖层`);
  }
  if (page.viewportSize()?.width === 390 && result.hasHorizontalOverflow) {
    throw new Error(`${label} 在 390px 下存在横向溢出`);
  }
}

async function main(): Promise<void> {
  const seeded = await seedQaData();
  const browser = await chromium.launch();
  try {
    const desktop = await browser.newPage({
      viewport: { width: 1440, height: 826 },
      deviceScaleFactor: 1,
    });
    watchPage(desktop);
    await desktop.goto("http://127.0.0.1:3000/");
    await desktop.waitForLoadState("networkidle");
    await assertRendered(desktop, "桌面首页");
    await desktop.screenshot({
      path: path.join(outputDirectory, "implementation-home-1440x826.png"),
    });

    const title = desktop.getByRole("link", {
      name: "构建可靠的网址收藏工作流",
      exact: true,
    });
    await Promise.all([
      desktop.waitForURL(/\/bookmarks\/[^/]+$/),
      title.click(),
    ]);
    await desktop.waitForLoadState("networkidle");
    await desktop
      .getByRole("heading", {
        name: "构建可靠的网址收藏工作流",
        level: 1,
      })
      .waitFor();
    await desktop.setViewportSize({ width: 1440, height: 758 });
    await assertRendered(desktop, "桌面详情");
    await desktop.screenshot({
      path: path.join(outputDirectory, "implementation-detail-1440x758.png"),
    });

    const mobile = await browser.newPage({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 1,
    });
    watchPage(mobile);
    await mobile.goto("http://127.0.0.1:3000/");
    await mobile.waitForLoadState("networkidle");
    await assertRendered(mobile, "移动首页");
    await mobile.screenshot({
      path: path.join(outputDirectory, "implementation-mobile-390x844.png"),
    });
    await mobile.getByRole("button", { name: "打开导航" }).click();
    await mobile.waitForTimeout(300);
    await assertRendered(mobile, "移动导航");
    await mobile.screenshot({
      path: path.join(outputDirectory, "implementation-mobile-nav-390x844.png"),
    });
    await mobile
      .getByRole("banner")
      .getByRole("button", { name: "关闭导航" })
      .click();
    await mobile.goto(`http://127.0.0.1:3000/bookmarks/${seeded.id}`);
    await mobile.waitForLoadState("networkidle");
    await assertRendered(mobile, "移动详情");
    await mobile.screenshot({
      path: path.join(
        outputDirectory,
        "implementation-mobile-detail-390x844.png",
      ),
    });

    if (browserErrors.length > 0) {
      throw new Error(`浏览器错误：${browserErrors.join(" | ")}`);
    }

    console.log(
      JSON.stringify(
        {
          bookmarkId: seeded.id,
          screenshots: {
            home: "implementation-home-1440x826.png",
            detail: "implementation-detail-1440x758.png",
            mobile: "implementation-mobile-390x844.png",
            mobileNav: "implementation-mobile-nav-390x844.png",
            mobileDetail: "implementation-mobile-detail-390x844.png",
          },
          browserErrors,
        },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
    await resetQaData();
  }
}

void main();
