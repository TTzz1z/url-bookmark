import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

function watchBrowserErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(`console: ${message.text()}`);
    }
  });
  return errors;
}

async function createFixtureBookmark(request: APIRequestContext) {
  const response = await request.post("/api/bookmarks", {
    data: {
      url: "http://127.0.0.1:3100/api/test-fixture/article",
    },
  });
  expect(response.status()).toBe(201);
  return (await response.json()) as {
    id: string;
    title: string;
    markdownContent: string;
  };
}

async function openAddForm(page: Page) {
  const collapsed = page.getByRole("button", { name: /粘贴 URL 添加收藏/ });
  if (await collapsed.isVisible().catch(() => false)) {
    await collapsed.click();
  }
  await expect(page.getByLabel("要收藏的网址")).toBeVisible();
}

test.beforeEach(async ({ request }) => {
  const bookmarks = (await (
    await request.get("/api/bookmarks?pageSize=100")
  ).json()) as { items: Array<{ id: string }> };
  for (const bookmark of bookmarks.items) {
    await request.delete(`/api/bookmarks/${bookmark.id}`);
  }
  const tags = (await (await request.get("/api/tags")).json()) as {
    items: Array<{ id: string }>;
  };
  for (const tag of tags.items) {
    await request.delete(`/api/tags/${tag.id}`);
  }
});

test("收藏、提取、加标签、详情、正文搜索与标签筛选", async ({
  page,
  request,
}) => {
  const browserErrors = watchBrowserErrors(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "全部收藏" })).toBeVisible();
  await expect(page.getByText("还没有收藏网址")).toBeVisible();

  const fixtureUrl =
    "http://127.0.0.1:3100/api/test-fixture/article";
  await openAddForm(page);
  await page.getByLabel("要收藏的网址").fill(fixtureUrl);
  await page.getByRole("button", { name: "添加收藏" }).click();

  await expect(page.getByText(/已收藏「构建可靠的网址收藏工作流」/)).toBeVisible();
  const titleLink = page.getByRole("link", {
    name: "构建可靠的网址收藏工作流",
    exact: true,
  });
  await expect(titleLink).toBeVisible();
  await titleLink.click();

  await expect(page.getByText("正在加载书签…")).toBeHidden({
    timeout: 60_000,
  });
  await expect(
    page.getByRole("heading", {
      name: "构建可靠的网址收藏工作流",
      level: 1,
    }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("从输入到阅读")).toBeVisible();
  const localizedImage = page.locator(
    '.markdown-body img[src^="/api/bookmarks/"][src*="/assets/"]',
  );
  await expect(localizedImage).toHaveCount(1);
  await expect
    .poll(() =>
      localizedImage.evaluate(
        (image) => (image as HTMLImageElement).naturalWidth,
      ),
    )
    .toBeGreaterThan(0);
  const localizedImagePath = await localizedImage.getAttribute("src");
  expect(localizedImagePath).toBeTruthy();

  await page.getByRole("tab", { name: "编辑模式" }).click();
  await page
    .getByRole("textbox", { name: "添加标签" })
    .fill("端到端测试, 阅读");
  await page
    .getByRole("textbox", { name: "备注", exact: true })
    .fill("Playwright 核心流程验证");
  await page.getByRole("button", { name: "保存修改" }).click();
  await expect(page.getByRole("tab", { name: "编辑模式" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.getByRole("tab", { name: "阅读模式" }).click();
  await expect(page.getByRole("link", { name: "端到端测试" })).toBeVisible();

  await page.getByRole("tab", { name: "编辑模式" }).click();
  const titleEditor = page.getByRole("textbox", { name: "标题" });
  await titleEditor.fill("不应保留的未保存标题");
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "放弃未保存的修改？" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "放弃修改" }).click();
  await page.getByRole("tab", { name: "编辑模式" }).click();
  await expect(titleEditor).toHaveValue("构建可靠的网址收藏工作流");

  const markdownEditor = page.getByRole("textbox", { name: "Markdown 正文" });
  await markdownEditor.fill(
    `${await markdownEditor.inputValue()}\n\n## 用户补充\n\n这段手写内容不得静默覆盖。`,
  );
  await page.getByRole("button", { name: "保存修改" }).click();
  await expect(page.getByRole("tab", { name: "编辑模式" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.getByRole("tab", { name: "阅读模式" }).click();

  await page.getByRole("button", { name: "重新提取" }).click();
  await expect(
    page.getByRole("heading", { name: "覆盖手动编辑的正文？" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "取消" }).click();
  await page.getByRole("tab", { name: "Markdown 源码" }).click();
  await expect(page.getByText("这段手写内容不得静默覆盖。")).toBeVisible();

  await page.getByRole("link", { name: "返回列表" }).click();
  await expect(page.getByRole("heading", { name: "全部收藏" })).toBeVisible();

  await page.getByLabel("搜索收藏").fill("持久化");
  await expect(
    page.getByRole("link", {
      name: "构建可靠的网址收藏工作流",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator("mark.search-highlight")).toContainText("持久化");

  await page.getByRole("button", { name: /端到端测试/ }).click();
  await expect(
    page.getByRole("link", {
      name: "构建可靠的网址收藏工作流",
      exact: true,
    }),
  ).toBeVisible();

  await page
    .getByRole("link", {
      name: "构建可靠的网址收藏工作流",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "删除" }).click();
  await page.getByRole("button", { name: "确认删除" }).click();
  await expect(page.getByText(/已删除「构建可靠的网址收藏工作流」/)).toBeVisible();
  await expect(page.getByText("还没有收藏网址")).toBeVisible();
  // 软删除保留资源以便撤销；撤销窗口内图片仍可访问。
  expect((await request.get(localizedImagePath!)).status()).toBe(200);
  await page.getByRole("button", { name: "撤销" }).click();
  await expect(
    page.getByRole("heading", {
      name: "构建可靠的网址收藏工作流",
      level: 1,
    }),
  ).toBeVisible();
  expect(browserErrors).toEqual([]);
});

test("超过 50 条收藏后可继续加载", async ({ page }) => {
  const browserErrors = watchBrowserErrors(page);
  const now = new Date().toISOString();
  const mockedBookmarks = Array.from({ length: 51 }, (_, index) => ({
    id: `bookmark-${index}`,
    url: `https://example.com/${index}`,
    normalizedUrl: `https://example.com/${index}`,
    finalUrl: `https://example.com/${index}`,
    title: `分页收藏 ${String(index + 1).padStart(2, "0")}`,
    domain: "example.com",
    description: "用于验证加载更多",
    author: null,
    faviconUrl: null,
    coverImageUrl: null,
    markdownContent: "分页正文",
    plainText: "分页正文",
    userNote: "",
    extractionStatus: "success",
    errorCode: null,
    errorMessage: null,
    httpStatusCode: 200,
    contentLength: 4,
    isContentEdited: false,
    retryCount: 0,
    extractedAt: now,
    createdAt: now,
    updatedAt: now,
    tags: [],
  }));

  await page.route("**/api/bookmarks?*", async (route) => {
    const requestUrl = new URL(route.request().url());
    const pageNumber = Number(requestUrl.searchParams.get("page") ?? "1");
    const pageSize = Number(requestUrl.searchParams.get("pageSize") ?? "50");
    const start = (pageNumber - 1) * pageSize;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: mockedBookmarks.slice(start, start + pageSize),
        total: mockedBookmarks.length,
      }),
    });
  });
  await page.route("**/api/tags", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ items: [] }),
    }),
  );

  await page.goto("/");
  await expect(page.getByTestId("bookmark-card")).toHaveCount(50);
  await expect(page.getByText("已显示 50 / 51 条收藏")).toBeVisible();
  await page.getByRole("button", { name: "加载更多" }).click({ force: true });
  await expect(page.getByTestId("bookmark-card")).toHaveCount(51, {
    timeout: 15_000,
  });
  await expect(page.getByText("已显示 51 / 51 条收藏")).toBeVisible();
  await expect(page.getByRole("button", { name: "加载更多" })).toHaveCount(0);
  expect(browserErrors).toEqual([]);
});

test("标签管理显示用量并支持重命名和确认删除", async ({
  page,
  request,
}) => {
  const browserErrors = watchBrowserErrors(page);
  const bookmark = await createFixtureBookmark(request);
  const updateResponse = await request.patch(`/api/bookmarks/${bookmark.id}`, {
    data: { tagNames: ["待整理"] },
  });
  expect(updateResponse.ok()).toBeTruthy();

  await page.goto("/");
  await page.getByRole("button", { name: /标签管理/ }).click();
  const tagManager = page.getByRole("dialog", { name: "标签管理" });
  await expect(
    tagManager.getByRole("heading", { name: "标签管理", exact: true }),
  ).toBeVisible();
  await expect(tagManager.getByText("1 条收藏", { exact: true })).toBeVisible();

  await tagManager
    .getByRole("button", { name: "重命名标签 待整理" })
    .click();
  const nameInput = tagManager.getByRole("textbox", {
    name: "重命名标签 待整理",
  });
  await nameInput.fill("已整理");
  await tagManager.getByRole("button", { name: "保存标签 待整理" }).click();
  await expect(tagManager.getByText("已整理", { exact: true })).toBeVisible();

  await tagManager.getByRole("button", { name: "删除标签 已整理" }).click();
  await expect(
    page.getByRole("heading", { name: "删除标签“已整理”？" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await expect(tagManager.getByText("已整理", { exact: true })).toBeVisible();

  await tagManager.getByRole("button", { name: "删除标签 已整理" }).click();
  await page.getByRole("button", { name: "确认删除标签" }).click();
  await expect(
    tagManager.getByText("还没有标签。在上方输入名称后点击「新增标签」。"),
  ).toBeVisible();

  const persisted = await request.get(`/api/bookmarks/${bookmark.id}`);
  expect(persisted.ok()).toBeTruthy();
  expect((await persisted.json()).tags).toEqual([]);
  expect(browserErrors).toEqual([]);
});

test("SSRF 拦截后仍保留失败书签并允许手动补充", async ({ page }) => {
  const browserErrors = watchBrowserErrors(page);
  await page.goto("/");
  await openAddForm(page);
  await page
    .getByLabel("要收藏的网址")
    .fill("http://169.254.169.254/latest/meta-data");
  await page.getByRole("button", { name: "添加收藏" }).click();

  await expect(page.getByText(/已加入队列|已收藏/)).toBeVisible();
  await expect(page.getByText("抓取失败")).toBeVisible();
  const failedBookmark = page.getByRole("link", {
    name: "169.254.169.254",
    exact: true,
  });
  await expect(failedBookmark).toBeVisible();
  await failedBookmark.click();
  await expect(page.getByText("出于安全原因，不能访问本地或内网地址")).toBeVisible();

  await page.getByRole("tab", { name: "编辑模式" }).click();
  await page
    .getByRole("textbox", { name: "备注", exact: true })
    .fill("失败网址仍然保留");
  await page
    .getByRole("textbox", { name: "Markdown 正文" })
    .fill("# 手动归档\n\n抓取失败后仍可整理内容。");
  await page.getByRole("button", { name: "保存修改" }).click();
  await expect(
    page
      .locator(".markdown-preview-panel")
      .getByText("抓取失败后仍可整理内容。", { exact: true }),
  ).toBeVisible();
  expect(browserErrors).toEqual([]);
});

test("用户 Markdown 渲染不会执行 XSS", async ({ page, request }) => {
  const browserErrors = watchBrowserErrors(page);
  const bookmark = await createFixtureBookmark(request);
  const maliciousMarkdown = [
    "# 安全渲染验证",
    "<script>window.__bookmarkXss = true</script>",
    '<img src="x" onerror="window.__bookmarkXss = true">',
    "[危险链接](javascript:alert(1))",
    "![危险图片](data:image/svg+xml;base64,PHN2Zz4=)",
    "![邮件图片](mailto:attacker@example.com)",
    "[安全链接](https://example.com/article)",
    "![安全图片](https://example.com/image.png)",
  ].join("\n\n");
  const response = await request.patch(`/api/bookmarks/${bookmark.id}`, {
    data: { markdownContent: maliciousMarkdown },
  });
  expect(response.ok()).toBeTruthy();

  await page.goto(`/bookmarks/${bookmark.id}`);
  await expect(
    page.getByRole("heading", { name: "安全渲染验证", level: 1 }),
  ).toBeVisible();
  await expect(page.locator(".markdown-body script")).toHaveCount(0);
  await expect(page.locator('.markdown-body [onerror]')).toHaveCount(0);
  await expect(page.locator('.markdown-body a[href^="javascript:"]')).toHaveCount(0);
  await expect(page.locator('.markdown-body img[src^="data:"]')).toHaveCount(0);
  await expect(page.locator('.markdown-body img[src^="mailto:"]')).toHaveCount(0);
  await expect(
    page.locator('.markdown-body a[href="https://example.com/article"]'),
  ).toHaveCount(1);
  await expect(
    page.locator('.markdown-body img[src="https://example.com/image.png"]'),
  ).toHaveCount(1);
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, "__bookmarkXss")))
    .toBeUndefined();
  expect(browserErrors).toEqual([]);
});

test("从列表删除收藏后保留当前滚动位置", async ({ page, request }) => {
  for (let index = 0; index < 8; index += 1) {
    const response = await request.post("/api/bookmarks", {
      data: {
        url: `http://127.0.0.1:3100/api/test-fixture/article?scroll=${index}`,
      },
    });
    expect(response.status()).toBe(201);
  }

  await page.goto("/");
  const cards = page.getByTestId("bookmark-card");
  await expect(cards).toHaveCount(8);

  const lastCard = cards.last();
  await lastCard.scrollIntoViewIfNeeded();
  const scrollBeforeDelete = await page.evaluate(() => window.scrollY);
  expect(scrollBeforeDelete).toBeGreaterThan(0);

  await lastCard.getByRole("button", { name: "更多操作" }).click();
  await lastCard.getByRole("button", { name: "删除", exact: true }).click();
  await page.getByRole("button", { name: "确认删除" }).click();

  await expect(cards).toHaveCount(7);
  await expect(page.getByText(/已删除「/)).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(0);
});

test("390px 移动端核心操作、标签展开与详情布局可用", async ({
  page,
  request,
}) => {
  const browserErrors = watchBrowserErrors(page);
  const bookmark = await createFixtureBookmark(request);
  for (let index = 1; index <= 7; index += 1) {
    const response = await request.post("/api/tags", {
      data: { name: `验收标签${index}` },
    });
    expect(response.ok()).toBeTruthy();
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: /粘贴 URL 添加收藏/ }),
  ).toBeVisible();
  await expect(page.getByLabel("搜索收藏")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);

  await page.getByRole("button", { name: "打开导航" }).click();
  const moreTags = page.getByRole("button", { name: /更多标签/ });
  await expect(moreTags).toBeVisible();
  await moreTags.click();
  await expect(page.getByRole("button", { name: /验收标签7/ })).toBeVisible();
  await page
    .getByRole("banner")
    .getByRole("button", { name: "关闭导航" })
    .click();

  await page.goto(`/bookmarks/${bookmark.id}`);
  await expect(page.getByRole("button", { name: "重新提取" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Markdown 源码" })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  expect(browserErrors).toEqual([]);
});
