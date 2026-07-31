import { count, eq, inArray } from "drizzle-orm";
import { createDatabase, resolveDatabasePath } from "./client";
import { bookmarks, bookmarkTags, tags, type ExtractionStatus } from "./schema";

type DemoTagDefinition = {
  id: string;
  name: string;
  normalizedName: string;
};

type DemoBookmarkDefinition = {
  id: string;
  url: string;
  title: string;
  domain: string;
  description: string;
  author: string;
  markdownContent: string;
  userNote: string;
  extractionStatus: ExtractionStatus;
  errorCode?: string;
  errorMessage?: string;
  httpStatusCode: number;
  retryCount?: number;
  createdHoursAgo: number;
  updatedMinutesAfter: number;
  tagNames: string[];
};

export const DEMO_TAGS: readonly DemoTagDefinition[] = [
  { id: "demo-tag-seeded", name: "演示数据", normalizedName: "演示数据" },
  { id: "demo-tag-engineering", name: "工程实践", normalizedName: "工程实践" },
  { id: "demo-tag-markdown", name: "Markdown", normalizedName: "markdown" },
  { id: "demo-tag-local-first", name: "本地优先", normalizedName: "本地优先" },
  { id: "demo-tag-sqlite", name: "SQLite", normalizedName: "sqlite" },
  { id: "demo-tag-design", name: "产品设计", normalizedName: "产品设计" },
  { id: "demo-tag-security", name: "安全", normalizedName: "安全" },
  { id: "demo-tag-reading", name: "阅读", normalizedName: "阅读" },
  { id: "demo-tag-extraction", name: "内容提取", normalizedName: "内容提取" },
] as const;

export const DEMO_BOOKMARKS: readonly DemoBookmarkDefinition[] = [
  {
    id: "demo-bookmark-reliable-workflow",
    url: "https://workflow.example/guides/reliable-bookmarks",
    title: "构建可靠的网址收藏工作流",
    domain: "workflow.example",
    description:
      "从安全抓取、正文提取到本地持久化，整理一条可检查、可恢复的网址收藏链路。",
    author: "网址收藏夹演示团队",
    markdownContent: `# 构建可靠的网址收藏工作流

> 好的收藏工具不只保存链接，还应保存上下文、正文与可检索的线索。

## 一条完整链路

1. 规范化 URL，并在每次跳转前重新执行安全检查；
2. 提取真正的文章正文，过滤导航、广告与不可信 HTML；
3. 转换为结构清晰的 Markdown，保留标题、列表、引用与代码；
4. 将正文、标签和备注写入本地 SQLite；
5. 通过关键词与标签快速找回内容。

## 演示检查表

| 检查项 | 预期结果 |
| --- | --- |
| 重复初始化 | 演示记录恢复为标准内容，不产生重复项 |
| 安全清理 | 只删除演示记录，普通收藏保持不变 |
| 离线展示 | 初始化过程不依赖任何外部网站 |

\`\`\`ts
const workflow = ["validate", "extract", "sanitize", "persist", "search"];
console.log(workflow.join(" → "));
\`\`\`

这条示例正文包含独特搜索词：**星图工作流**。`,
    userNote: "录屏主线示例：适合展示详情阅读、Markdown 源码和“星图工作流”正文搜索。",
    extractionStatus: "success",
    httpStatusCode: 200,
    createdHoursAgo: 1,
    updatedMinutesAfter: 12,
    tagNames: ["演示数据", "工程实践", "阅读"],
  },
  {
    id: "demo-bookmark-readability-markdown",
    url: "https://markdown.example/articles/readability-pipeline",
    title: "从网页正文到结构化 Markdown",
    domain: "markdown.example",
    description:
      "拆解 Readability、内容清理与 Markdown 转换之间的职责边界和质量检查点。",
    author: "内容工程小组",
    markdownContent: `# 从网页正文到结构化 Markdown

网页提取不是简单地删除标签。稳定的内容管线通常分为三个阶段：

## 1. 识别正文

Readability 根据文本密度、语义结构和链接比例识别主要内容区域。

## 2. 清理内容

- 移除脚本、表单和事件属性；
- 将相对链接转换为绝对地址；
- 保留代码块、表格、引用和必要的图片信息。

## 3. 转换与校验

转换后的 Markdown 需要经过结构校验。标题层级、围栏代码块和 GFM 表格应保持可读，
同时生成纯文本字段供关键词搜索使用。

关键搜索词：**结构化正文**。`,
    userNote: "可在搜索框输入“结构化正文”，演示正文检索与命中摘要。",
    extractionStatus: "success",
    httpStatusCode: 200,
    createdHoursAgo: 5,
    updatedMinutesAfter: 18,
    tagNames: ["演示数据", "Markdown", "内容提取"],
  },
  {
    id: "demo-bookmark-local-first-sqlite",
    url: "https://local-first.example/handbook/sqlite-persistence",
    title: "本地优先应用：SQLite 数据持久化实践",
    domain: "local-first.example",
    description:
      "使用单文件数据库、WAL 与明确备份边界，为个人知识库提供低运维的数据可靠性。",
    author: "本地优先实践组",
    markdownContent: `# 本地优先应用：SQLite 数据持久化实践

本地优先意味着用户的数据在没有云服务时仍然可读、可写、可备份。

## 推荐约束

- 数据库路径固定且在 README 中明确说明；
- 启用外键，保证删除书签时关联关系同步清理；
- 使用 WAL 提升读写并发体验；
- 迁移脚本可以重复执行；
- 备份前正常停止服务，恢复后再次执行迁移。

## 恢复演练

一次有效的恢复演练应覆盖：关闭服务、复制数据库、重新启动以及确认旧书签仍可搜索。

独特搜索词：**离线优先恢复**。`,
    userNote: "持久化演示：服务重启后仍可通过“离线优先恢复”找到此记录。",
    extractionStatus: "success",
    httpStatusCode: 200,
    createdHoursAgo: 10,
    updatedMinutesAfter: 25,
    tagNames: ["演示数据", "本地优先", "SQLite"],
  },
  {
    id: "demo-bookmark-responsive-reading",
    url: "https://design.example/checklists/responsive-reading",
    title: "响应式阅读界面的设计检查清单",
    domain: "design.example",
    description:
      "用一致的层级、留白和操作反馈，让桌面端与 390px 移动端都保持清晰可用。",
    author: "产品体验团队",
    markdownContent: `# 响应式阅读界面的设计检查清单

## 信息层级

- 页面标题和主要操作应首先进入视线；
- 状态、域名和时间属于辅助信息，不应压过正文；
- 标签既是分类信息，也是可直接操作的筛选入口。

## 窄屏体验

在 390px 视口下检查导航抽屉、表单按钮、长 URL 换行和 Markdown 表格。
所有核心操作都应可触达，页面不应出现横向滚动。

## 反馈

加载、保存、失败与删除确认需要使用统一的中文文案，并保持键盘焦点可见。`,
    userNote: "截图建议：分别用 1440px 和 390px 打开，展示同一视觉系统的响应式延续。",
    extractionStatus: "success",
    httpStatusCode: 200,
    createdHoursAgo: 24,
    updatedMinutesAfter: 36,
    tagNames: ["演示数据", "产品设计", "阅读"],
  },
  {
    id: "demo-bookmark-ssrf-defense",
    url: "https://security.example/guides/ssrf-defense-in-depth",
    title: "SSRF 防护：从 URL 到重定向的纵深校验",
    domain: "security.example",
    description:
      "覆盖协议、主机名、DNS 解析结果、固定连接地址和每一跳重定向的完整防护思路。",
    author: "应用安全团队",
    markdownContent: `# SSRF 防护：从 URL 到重定向的纵深校验

仅在输入阶段检查 URL 并不足够。请求链路中的 DNS 和重定向都可能改变最终目标。

## 必要检查

1. 只允许 HTTP 与 HTTPS；
2. 拒绝 localhost、回环、私有、链路本地和元数据地址；
3. 检查 DNS 返回的全部地址；
4. 将连接固定到已验证的地址，缩小 DNS 重绑定窗口；
5. 每次重定向都重新校验；
6. 限制超时、响应体大小与重定向次数。

安全测试应同时包含 IPv4、IPv6 和“公网地址重定向到内网”的场景。`,
    userNote: "标签筛选示例：点击“安全”；也可搜索域名 security.example。",
    extractionStatus: "success",
    httpStatusCode: 200,
    createdHoursAgo: 35,
    updatedMinutesAfter: 42,
    tagNames: ["演示数据", "安全", "工程实践"],
  },
  {
    id: "demo-bookmark-resilient-pipeline",
    url: "https://pipeline.example/notes/resilient-content-processing",
    title: "Designing Resilient Content Pipelines",
    domain: "pipeline.example",
    description:
      "An English example covering deterministic fixtures, observable failures, and repeatable recovery.",
    author: "Content Platform Group",
    markdownContent: `# Designing Resilient Content Pipelines

A production-ready pipeline makes every stage observable without making the recording depend on
the public network.

## Principles

- use deterministic fixtures for screenshots;
- preserve failed records with actionable error messages;
- keep user edits unless overwrite is explicitly confirmed;
- verify persistence after a real process restart;
- make cleanup narrow, transactional, and repeatable.

Unique search phrase: **observable recovery path**.`,
    userNote: "English search demo: enter “observable recovery path” or “pipeline.example”.",
    extractionStatus: "success",
    httpStatusCode: 200,
    createdHoursAgo: 52,
    updatedMinutesAfter: 51,
    tagNames: ["演示数据", "工程实践", "内容提取"],
  },
  {
    id: "demo-bookmark-partial-extraction",
    url: "https://archive.example/research/complex-page-extraction",
    title: "复杂网页的正文提取边界",
    domain: "archive.example",
    description:
      "页面包含可阅读内容，但正文较短；系统保留已提取片段并标记为部分提取。",
    author: "内容质量研究组",
    markdownContent: `# 复杂网页的正文提取边界

该页面的主要内容由多个动态区域组成。当前已保留可确认的摘要、来源链接和结论片段，
但正文长度不足以判定为完整提取。

## 已保留内容

- 页面主题和作者信息；
- 可公开读取的核心摘要；
- 原始网址与最终网址；
- 用户补充的备注和标签。`,
    userNote: "状态筛选示例：选择“部分提取”，说明可用内容不会因质量不足而被丢弃。",
    extractionStatus: "partial",
    errorCode: "CONTENT_TOO_SHORT",
    errorMessage: "已提取到部分正文，但内容长度不足；可阅读片段已保留。",
    httpStatusCode: 200,
    retryCount: 1,
    createdHoursAgo: 74,
    updatedMinutesAfter: 63,
    tagNames: ["演示数据", "内容提取", "阅读"],
  },
  {
    id: "demo-bookmark-failed-extraction",
    url: "https://members.example/reports/private-knowledge-base",
    title: "受限页面：登录后内容不可提取",
    domain: "members.example",
    description:
      "用于演示抓取失败时仍保留网址、状态、错误原因、备注和后续处理入口。",
    author: "知识管理团队",
    markdownContent: "",
    userNote: "失败处理示例：记录没有被删除，可在详情中补充 Markdown 或稍后重新提取。",
    extractionStatus: "failed",
    errorCode: "AUTH_REQUIRED",
    errorMessage: "页面需要登录，无法读取公开正文；网址和用户信息已安全保留。",
    httpStatusCode: 401,
    retryCount: 2,
    createdHoursAgo: 96,
    updatedMinutesAfter: 75,
    tagNames: ["演示数据", "内容提取"],
  },
] as const;

export type DemoSeedResult = {
  databasePath: string;
  bookmarksUpserted: number;
  tagsCreated: number;
  existingTagsReused: number;
};

export type DemoClearResult = {
  databasePath: string;
  bookmarksDeleted: number;
  tagsDeleted: number;
  tagsRetained: number;
};

function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```[^\n]*\n?|```/g, " "))
    .replace(/[#>*_`~[\]()|!-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function demoConflict(message: string): Error {
  return new Error(`演示数据安全检查未通过：${message}`);
}

export function seedDemoData(
  databasePath = resolveDatabasePath(),
  referenceTime = new Date(),
): DemoSeedResult {
  const database = createDatabase(databasePath);
  try {
    return database.transaction((transaction) => {
      for (const definition of DEMO_BOOKMARKS) {
        const existingById = transaction
          .select({
            id: bookmarks.id,
            normalizedUrl: bookmarks.normalizedUrl,
          })
          .from(bookmarks)
          .where(eq(bookmarks.id, definition.id))
          .get();
        if (
          existingById &&
          existingById.normalizedUrl !== definition.url
        ) {
          throw demoConflict(
            `ID ${definition.id} 已被普通书签占用，未执行任何写入`,
          );
        }

        const existingByUrl = transaction
          .select({ id: bookmarks.id })
          .from(bookmarks)
          .where(eq(bookmarks.normalizedUrl, definition.url))
          .get();
        if (existingByUrl && existingByUrl.id !== definition.id) {
          throw demoConflict(
            `网址 ${definition.url} 已被普通书签收藏，未覆盖该记录`,
          );
        }
      }

      const tagIdByName = new Map<string, string>();
      let tagsCreated = 0;
      let existingTagsReused = 0;

      for (const definition of DEMO_TAGS) {
        const existingById = transaction
          .select({ normalizedName: tags.normalizedName })
          .from(tags)
          .where(eq(tags.id, definition.id))
          .get();
        if (
          existingById &&
          existingById.normalizedName !== definition.normalizedName
        ) {
          throw demoConflict(
            `标签 ID ${definition.id} 已被其他标签占用，未执行任何写入`,
          );
        }

        const existingByName = transaction
          .select({ id: tags.id })
          .from(tags)
          .where(eq(tags.normalizedName, definition.normalizedName))
          .get();
        if (existingByName && existingByName.id !== definition.id) {
          tagIdByName.set(definition.name, existingByName.id);
          existingTagsReused += 1;
          continue;
        }

        const now = referenceTime;
        if (existingById) {
          transaction
            .update(tags)
            .set({ name: definition.name, updatedAt: now })
            .where(eq(tags.id, definition.id))
            .run();
        } else {
          transaction
            .insert(tags)
            .values({
              ...definition,
              createdAt: now,
              updatedAt: now,
            })
            .run();
          tagsCreated += 1;
        }
        tagIdByName.set(definition.name, definition.id);
      }

      for (const definition of DEMO_BOOKMARKS) {
        const createdAt = new Date(
          referenceTime.getTime() - definition.createdHoursAgo * 60 * 60 * 1_000,
        );
        const updatedAt = new Date(
          createdAt.getTime() + definition.updatedMinutesAfter * 60 * 1_000,
        );
        const markdownContent = definition.markdownContent.trim();
        const values = {
          url: definition.url,
          normalizedUrl: definition.url,
          finalUrl: definition.url,
          title: definition.title,
          domain: definition.domain,
          description: definition.description,
          author: definition.author,
          faviconUrl: null,
          coverImageUrl: null,
          markdownContent,
          plainText: markdownToPlainText(markdownContent),
          userNote: definition.userNote,
          extractionStatus: definition.extractionStatus,
          errorCode: definition.errorCode ?? null,
          errorMessage: definition.errorMessage ?? null,
          httpStatusCode: definition.httpStatusCode,
          contentLength: markdownContent.length,
          isContentEdited: false,
          retryCount: definition.retryCount ?? 0,
          extractedAt: new Date(createdAt.getTime() + 2 * 60 * 1_000),
          createdAt,
          updatedAt,
        };
        transaction
          .insert(bookmarks)
          .values({ id: definition.id, ...values })
          .onConflictDoUpdate({
            target: bookmarks.id,
            set: values,
          })
          .run();
      }

      const demoBookmarkIds = DEMO_BOOKMARKS.map((bookmark) => bookmark.id);
      transaction
        .delete(bookmarkTags)
        .where(inArray(bookmarkTags.bookmarkId, demoBookmarkIds))
        .run();

      transaction
        .insert(bookmarkTags)
        .values(
          DEMO_BOOKMARKS.flatMap((bookmark) =>
            bookmark.tagNames.map((tagName) => {
              const tagId = tagIdByName.get(tagName);
              if (!tagId) {
                throw demoConflict(`找不到演示标签 ${tagName}`);
              }
              return {
                bookmarkId: bookmark.id,
                tagId,
                createdAt: referenceTime,
              };
            }),
          ),
        )
        .run();

      return {
        databasePath,
        bookmarksUpserted: DEMO_BOOKMARKS.length,
        tagsCreated,
        existingTagsReused,
      };
    });
  } finally {
    database.$client.close();
  }
}

export function clearDemoData(
  databasePath = resolveDatabasePath(),
): DemoClearResult {
  const database = createDatabase(databasePath);
  try {
    return database.transaction((transaction) => {
      for (const definition of DEMO_BOOKMARKS) {
        const existing = transaction
          .select({ normalizedUrl: bookmarks.normalizedUrl })
          .from(bookmarks)
          .where(eq(bookmarks.id, definition.id))
          .get();
        if (existing && existing.normalizedUrl !== definition.url) {
          throw demoConflict(
            `ID ${definition.id} 对应的网址不是演示网址，未删除任何记录`,
          );
        }
      }

      for (const definition of DEMO_TAGS) {
        const existing = transaction
          .select({ normalizedName: tags.normalizedName })
          .from(tags)
          .where(eq(tags.id, definition.id))
          .get();
        if (
          existing &&
          existing.normalizedName !== definition.normalizedName
        ) {
          throw demoConflict(
            `标签 ID ${definition.id} 对应的名称不匹配，未删除任何记录`,
          );
        }
      }

      const demoBookmarkIds = DEMO_BOOKMARKS.map((bookmark) => bookmark.id);
      const bookmarksDeleted = transaction
        .delete(bookmarks)
        .where(inArray(bookmarks.id, demoBookmarkIds))
        .run().changes;

      let tagsDeleted = 0;
      let tagsRetained = 0;
      for (const definition of DEMO_TAGS) {
        const existing = transaction
          .select({ id: tags.id })
          .from(tags)
          .where(eq(tags.id, definition.id))
          .get();
        if (!existing) {
          continue;
        }
        const usage =
          transaction
            .select({ value: count() })
            .from(bookmarkTags)
            .where(eq(bookmarkTags.tagId, definition.id))
            .get()?.value ?? 0;
        if (usage > 0) {
          tagsRetained += 1;
          continue;
        }
        tagsDeleted += transaction
          .delete(tags)
          .where(eq(tags.id, definition.id))
          .run().changes;
      }

      return {
        databasePath,
        bookmarksDeleted,
        tagsDeleted,
        tagsRetained,
      };
    });
  } finally {
    database.$client.close();
  }
}
