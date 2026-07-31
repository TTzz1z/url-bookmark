# 实施计划

## 当前状态

初始仓库仅包含需求设计、验收清单和 UI 原型图；没有应用代码、包管理配置、
数据库、测试或运行脚本。项目将从零实现，但保留并修订现有文档。

## 执行阶段

1. **文档与视觉基线**：统一为本地运行交付，锁定 SQL LIKE 搜索和 UI Token。
2. **应用与数据库**：初始化 Next.js + TypeScript，创建 Drizzle/SQLite 表结构、
   迁移、Repository 与持久化 CRUD。
3. **正文提取**：实现 URL 规范化、DNS/IP/重定向 SSRF 防护、受限 HTTP 抓取、
   Readability、DOMPurify 和 Turndown。
4. **业务闭环**：实现收藏、列表、详情、编辑、删除、重新提取、标签、搜索及
   success/partial/failed/pending 状态。
5. **验证与交付**：完成 fixture、Vitest、集成测试、Playwright 核心 E2E、
   TypeScript、ESLint、生产构建、Windows 脚本、README 和验收报告。

## 明确边界

- 不使用 Redis、消息队列、外部搜索服务、用户系统或付费 API；
- Playwright 只用于 E2E，不参与默认网页抓取；
- P0 搜索使用 SQLite LIKE 与标签关系查询，FTS5 仅为 P1；
- 数据固定保存在 `data/bookmarks.db`，不提交真实数据库；
- 不执行目标网页 JavaScript，不保存原始 HTML，不静默覆盖用户手改 Markdown。
