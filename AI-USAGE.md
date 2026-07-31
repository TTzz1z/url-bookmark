# AI 协作说明

## 使用工具

本项目使用 Cursor / Codex 等工作区代理协助完成需求解析、文档修订、架构设计、
代码实现、测试、浏览器截图与验收。Playwright 用于应用 E2E 和视觉取证，不用于
网页正文抓取。Pillow 只用于把原型与浏览器截图组合成设计 QA 证据。

## AI 完成的工作

- 完整读取并校正设计与验收文档；
- 从原型提取视觉方向与 Token，生成 `UI-SPEC.md`；
- 实现 Next.js、Drizzle/SQLite、API、正文提取、安全与业务页面；
- 建立本地 HTML fixture、单元、集成和 Playwright E2E；
- 实现图片归档、Vega-Lite 服务端栅格化、软删除恢复、主题与标签管理；
- 编写 Windows 源码脚本、便携 ZIP 打包/校验脚本、README、演示脚本和验收报告；
- 运行真实命令，并依据失败结果持续修正；
- 对原型与浏览器实现执行多轮同视口设计 QA。

## 由项目负责人确认的决策

初始任务和仓库文档明确确认了产品范围、技术栈、本地交付方式、SQLite 数据路径、
P0 LIKE 搜索、普通 HTTP 抓取、SSRF/XSS 边界以及不做登录、AI 和完整归档。
代理在这些已确认约束内完成实现，没有扩展到新的产品方向。发布形态确认为
Windows x64 便携 ZIP（自带 Node.js），不做需要安装和签名的单文件 `.exe`。

## 人工/工程验证方式

AI 生成内容没有仅凭文档判定完成，而是通过以下证据复核：

- TypeScript 与 ESLint；
- 62 项正文/安全/API/Markdown/图片与动态图表本地化、分页合并单元测试；
- 39 项抓取、数据库、业务服务和演示数据安全集成测试；
- 7 条真实 Playwright E2E（核心 CRUD、标签管理、失败保留、XSS、列表滚动、390px）；
- Next.js 生产构建和启动健康检查；
- SQLite 关闭重开持久化测试；
- Windows 便携包外部解压验收（health / 首页 / storage / 空库迁移）；
- 常规 GitHub Actions 工程门禁与独立 Playwright E2E 工作流；
- 桌面与 390px 移动截图取证；
- 浏览器控制台和页面错误监听。

2026-07-31 工程收口按顺序执行安装、迁移、类型检查、Lint、单元、集成、E2E、
生产构建与便携打包校验；上述数量来自 Vitest/Playwright 的真实输出。

## 收口阶段真实问题与校正（摘要）

下列问题都曾在真实命令、浏览器或外部验收中复现，不是臆测。完整表格见
[`.ai/ai-errors-and-corrections.md`](.ai/ai-errors-and-corrections.md)。

### 1. OpenAI 等站点 403 抓取

- **现象：** Undici 抓取 OpenAI 文章返回 403，同 URL 用系统 `curl` 可成功。
- **原因：** Cloudflare 等对 Node.js TLS 指纹更敏感；仅换 User-Agent 不够。
- **修正：** 浏览器风格请求头；对 401/403/429/503 在已通过 SSRF 校验的公网 IP
  上做 DNS pinning 的 `curl` 回退。
- **验证：** 公网文章可提取；SSRF 与私网拦截测试仍通过。

### 2. Vega-Lite 动态图表错位与字体塌缩

- **现象：** 图表被当成脚本丢掉，或栅格化后标签叠成一团、宽度挤成竖条。
- **原因：** 站点嵌的是 Vega-Lite JSON 而非 `<img>`；`width: "container"` 在无
  DOM 环境塌缩；CSS 主题色 token 与默认字体度量不匹配。
- **修正：** 从 HTML 提取可渲染 spec；规范化尺寸/主题；先加载 canvas 再编译
  Vega；输出 PNG 并写入本地 assets。
- **验证：** 相关单元测试与真实文章重提取后阅读模式可见图表。

### 3. Windows 上原生 `canvas` 编译失败

- **现象：** 依赖安装或运行时报原生模块/编译错误。
- **修正：** 使用 `@napi-rs/canvas` + 项目内 `file:vendor/canvas-*.tgz` shim，
  避免 `node-gyp` 与空 junction；便携打包前后校验该依赖。
- **验证：** 生产构建与图表渲染路径可用。

### 4. 便携包 standalone 漏拷运行时 JSON

- **现象：** 外部解压后 health/首页正常，`/api/storage` 返回 500。
- **原因：** Next.js 文件追踪复制了 `css-tree` JS，漏掉 `data/patch.json` 与
  `mdn-data` JSON。
- **修正：** 打包脚本完整复制这两个包并强制校验；`next.config` 增加 tracing
  includes；真实数据库不得进入 ZIP。
- **验证：** `npm run verify:portable` 在仓库外解压目录通过。

### 5. UI 阅读字体与布局迭代

- **现象：** 详情页阅读区与 UI 控件字体混用，信息密度过高；删除确认策略不一。
- **修正：** 阅读正文字体与 UI 字体分离；软删除 + Toast 撤销；工具带与卡片降噪。
- **验证：** typecheck、相关 E2E 与截图取证。

实际错误、发现方式、修正和修正后验证的完整列表持续维护在
`.ai/ai-errors-and-corrections.md`。该文件只记录真实发生的问题。
