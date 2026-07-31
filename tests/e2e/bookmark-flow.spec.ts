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
  await page.getByLabel("要收藏的网址").fill(fixtureUrl);
  await page.getByRole("button", { name: "添加收藏" }).click();

  await expect(
    page.getByText("收藏已保存，正文提取成功。"),
  ).toBeVisible();
  const titleLink = page.getByRole("link", {
    name: "构建可靠的网址收藏工作流",
    exact: true,
  });
  await expect(titleLink).toBeVisible();
  await titleLink.click();

  await expect(
    page.getByRole("heading", {
      name: "构建可靠的网址收藏工作流",
      level: 1,
    }),
  ).toBeVisible();
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
    .getByRole("textbox", { name: /^标签/ })
    .fill("端到端测试, 阅读");
  await page
    .getByRole("textbox", { name: "备注", exact: true })
    .fill("Playwright 核心流程验证");
  await page.getByRole("button", { name: "保存修改" }).click();
  await expect(page.getByText("修改已保存。")).toBeVisible();
  await expect(page.getByRole("link", { name: "端到端测试" })).toBeVisible();

  await page.getByRole("tab", { name: "编辑模式" }).click();
  const markdownEditor = page.getByRole("textbox", { name: "Markdown 正文" });
  await markdownEditor.fill(
    `${await markdownEditor.inputValue()}\n\n## 用户补充\n\n这段手写内容不得静默覆盖。`,
  );
  await page.getByRole("button", { name: "保存修改" }).click();
  await expect(page.getByText("修改已保存。")).toBeVisible();

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
  await expect(page.getByRole("heading", { name: "删除这条收藏？" })).toBeVisible();
  await page.getByRole("button", { name: "取消" }).click();
  await expect(
    page.getByRole("heading", {
      name: "构建可靠的网址收藏工作流",
      level: 1,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "删除" }).click();
  await page.getByRole("button", { name: "确认删除" }).click();
  await expect(page.getByText("还没有收藏网址")).toBeVisible();
  expect((await request.get(localizedImagePath!)).status()).toBe(404);
  expect(browserErrors).toEqual([]);
});

test("SSRF 拦截后仍保留失败书签并允许手动补充", async ({ page }) => {
  const browserErrors = watchBrowserErrors(page);
  await page.goto("/");
  await page
    .getByLabel("要收藏的网址")
    .fill("http://169.254.169.254/latest/meta-data");
  await page.getByRole("button", { name: "添加收藏" }).click();

  await expect(
    page.getByText("网址已保存，正文提取结果需要检查。"),
  ).toBeVisible();
  await expect(page.getByText("PRIVATE_NETWORK_BLOCKED")).toBeVisible();
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
  await expect(page.getByText("抓取失败后仍可整理内容。")).toBeVisible();
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

  await lastCard.getByRole("button", { name: /删除收藏/ }).click();
  await page.getByRole("button", { name: "全部删除" }).click();

  await expect(cards).toHaveCount(7);
  await expect(page.getByText("收藏、Markdown 正文及本地化图片已删除。")).toBeVisible();
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
  await expect(page.getByRole("button", { name: "添加收藏" })).toBeVisible();
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
