# 已确认决策

## 产品与交付

- 单用户、本地优先，不增加登录、协作、云同步或 AI 功能。
- 只保存提取后的 Markdown，不保存原始 HTML、截图、PDF 或完整网页归档。
- 交付方式为 npm 本地/生产运行以及 `setup.bat`、`start.bat`，不使用 Docker。
- 数据固定保存在 `data/bookmarks.db`，真实数据库不进入版本库。

## 架构

- Next.js App Router 单体应用；页面、Route Handlers、服务与数据库分层。
- 同步创建流程：先写入 `pending`，同一请求抓取并更新最终状态。
- SQLite + Drizzle；P0 搜索使用参数化 LIKE 与标签关系查询。
- 普通 HTTP/Undici 抓取优先，Playwright 只用于最终 E2E。

## 安全

- URL、主机名、DNS 结果、IP 与每次重定向都执行 SSRF 检查。
- Undici 连接固定到已验证 DNS 地址。
- 不发送 Cookie、不执行目标 JavaScript、限制超时/重定向/响应体。
- Readability 输出必须经过 DOMPurify；前端 Markdown 不启用原始 HTML。
- 本地 E2E 回环放行是默认关闭、生产强制无效的显式测试开关。

## 交互与视觉

- 视觉只依据 `docs/UI-REFERENCE.png`；使用集中颜色、间距和状态 Token。
- 详情中的“返回列表”放在顶栏，标题与主要动作同层。
- 失败书签保留；用户手改 Markdown 不会被静默覆盖。
- 390px 下导航使用抽屉，收集操作上下排列，筛选横向滚动。
