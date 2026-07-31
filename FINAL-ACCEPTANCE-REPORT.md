# 网址收藏夹最终独立验收报告

**验收日期：** 2026-07-31
**验收方式：** 不采信旧完成汇报，重新读取需求、验收清单、UI 规范、原型、全部
源码/迁移/脚本/测试，并实际执行数据库、静态检查、自动化、构建、启动、重启与
浏览器取证。  
**最终结论：** 题目四项核心功能全部 **PASS**；本地源码完整包与 Windows x64 便携
ZIP 均可交付。标签管理、深色模式、软删除恢复、本地图文包、动态 Vega 图表归档
等增强能力也已实现。正式 Git 标签与 GitHub Release 留待提交整理后创建。

状态定义：

- **PASS**：真实实现且有本轮命令、测试、文件或浏览器行为证据；
- **PARTIAL**：部分实现，仍有明确缺口；
- **FAIL**：要求范围内未实现或本轮验证失败；
- **NOT APPLICABLE**：明确不在本次范围，或当前目录没有相应对象可验收。

## 1. 题目四项功能要求

| 功能要求                              | 状态     | 本轮真实证据                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 粘贴网址并收藏，自动获取标题          | **PASS** | `src/services/bookmark-service.ts` 先写 `pending`，再调用提取并持久化；`src/services/extraction-service.ts` 实现 `og:title → twitter:title → title → Readability/域名`；Playwright“收藏、提取、加标签、详情、正文搜索与标签筛选”实际得到“构建可靠的网址收藏工作流”。                                                          |
| 提取网页主要正文并转换、保存 Markdown | **PASS** | `extraction-service.ts` 使用 Readability、DOMPurify、Turndown/GFM，同源分页最多 10 页；`image-localization-service` / `chart-extraction-service` 归档正文图片与 Vega-Lite PNG；单元测试覆盖正文、侧栏、代码、表格、懒加载、分页、图表与畸形 HTML。 |
| 添加一个或多个标签并按标签整理        | **PASS** | `tags`、`bookmark_tags` 迁移与 `setBookmarkTags`；详情编辑可添加/移除多个标签，侧栏可筛选并展开全部标签；核心 E2E 添加“端到端测试, 阅读”并按标签再次找到书签。                                                                                                                                                                |
| 关键词搜索并重新找到收藏              | **PASS** | `src/db/repository.ts` 参数化 LIKE 覆盖标题、原始 URL、最终 URL、域名、Markdown、备注、标签；集成测试逐字段验证；浏览器实际搜索正文“持久化”并显示命中上下文高亮。                                                                                                                                                             |

## 2. 本次 20 项独立验收

|   # | 验收项                                    | 状态     | 本轮真实证据                                                                                                                                                                                                                                                                                                                       |
| --: | ----------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|   1 | 对照原始要求逐项确认真实实现              | **PASS** | 完整复核 `docs/DESIGN.md`、`.ai/prompts/initial-brief.md`、API、服务、Repository、页面、迁移和测试；四项功能见第 1 节。                                                                                                                                                                                                            |
|   2 | 对照最终验收清单逐项检查                  | **PASS** | `docs/TASKS-AND-ACCEPTANCE.md` 的 A–G P0 均由本轮命令、测试、仓库或浏览器证据覆盖；Git 历史完整性单列为 PARTIAL，见第 3 节。                                                                                                                                                                                                       |
|   3 | 实际运行数据库迁移                        | **PASS** | `npm run db:migrate` 退出码 0，输出 `数据库已就绪：E:\url-bookmark\data\bookmarks.db`；全新临时目录中的 `setup.bat` 也成功创建数据库。                                                                                                                                                                                             |
|   4 | 实际运行 TypeScript 检查                  | **PASS** | `npm run typecheck` 退出码 0、0 个 TypeScript 错误；修复后及全新目录均再次通过。                                                                                                                                                                                                                                                   |
|   5 | 实际运行 ESLint                           | **PASS** | `npm run lint` 退出码 0、0 个 ESLint 错误/警告。                                                                                                                                                                                                                                                                                   |
|   6 | 实际运行单元测试                          | **PASS** | `npm run test:unit`：8 个文件、62 项测试全部通过；覆盖 DNS/Fake-IP、Markdown XSS、图片与 SVG 本地化、Vega 动态图表、分页合并和 API 错误映射。                                                                                                                                                                                      |
|   7 | 实际运行集成测试                          | **PASS** | `npm run test:integration`：4 个文件、39 项测试全部通过；覆盖安全抓取、Repository、软删除/恢复、失败重提取保护、演示数据初始化与安全清理。                                                                                                                                                                                         |
|   8 | 实际运行核心 Playwright E2E               | **PASS** | `npm run test:e2e`：Chromium 7/7 通过；核心 CRUD、超过 50 条继续加载、标签管理、SSRF 失败保留、XSS、列表滚动和 390px 布局均通过。                                                                                                                                                                                                  |
|   9 | 实际运行生产构建                          | **PASS** | `npm run build` 退出码 0；Next.js 16.2.12 编译、TypeScript、8/8 页面生成任务全部成功，所有页面/API 路由列出。                                                                                                                                                                                                                      |
|  10 | 检查 `setup.bat`、`start.bat` 与便携包 | **PASS** | 源码 `setup.bat`/`start.bat` 安装迁移与启动健康检查通过；`npm run package:portable` 生成约 76.8 MB ZIP（无用户数据库）；仓库外解压后 `verify:portable` 验证 health/首页/storage/空库迁移通过。 |
|  11 | 关闭并重启服务后 SQLite 数据仍存在        | **PASS** | 生产端口 3201 创建 ID `9adb4ec5-d8d9-4618-86bd-0b1d31de4028` 的 `failed` 书签；停止 PID 树、重新 `npm run start -- -p 3201` 后按同一 ID 读取成功；随后 API 清理回 0 条。                                                                                                                                                           |
|  12 | SSRF 覆盖 DNS、IP、重定向                 | **PASS** | `url-security-service.ts` 校验协议/主机、DNS 全部地址、IPv4/IPv6/映射地址；系统 DNS 全部落入 `198.18/15` 时通过固定可信 DoH 获取真实地址后再次校验，直接 Fake-IP、可信解析返回内网及混合内网结果仍被拦截；`fetch-service.ts` 固定到已审查地址并对每次重定向重查。真实验证 `sspai.com` 与 `www.anthropic.com` 均成功提取 Markdown。 |
|  13 | Markdown 渲染 XSS                         | **PASS** | 入库前 DOMPurify；`MarkdownView` 使用 `skipHtml`，链接仅允许 HTTP(S)/mailto/hash，图片仅允许 HTTP(S) 或严格匹配的本地资源路由；本地资源设置 `nosniff` 和沙箱 CSP。单元与 E2E 确认无 script、onerror、javascript/data/mailto 图片和 console error。                                                                                 |
|  14 | 抓取失败时保留书签                        | **PASS** | `createBookmark` 在抓取前插入 `pending`，`extractUrl` 把异常转为 `failed` 再更新；集成测试“抓取失败时仍保留 failed 书签、标签和错误信息”；E2E 私网地址页面仍可打开、加备注和手写 Markdown。                                                                                                                                        |
|  15 | 用户 Markdown 不会被重提取静默覆盖        | **PASS** | `is_content_edited` 持久化；服务端无确认返回 `CONTENT_EDITED`，失败重试保留手写正文；客户端已编辑时直接显示覆盖确认；集成测试及核心 E2E 均验证。仅修改备注/标签不再误标正文为已编辑。                                                                                                                                              |
|  16 | 搜索覆盖标题、URL、域名、正文、备注、标签 | **PASS** | `repository.test.ts` 逐字段验证标题、原始 URL、最终 URL、域名、Markdown、备注、标签；SQL 使用绑定参数和 LIKE 转义；核心 E2E 验证正文命中、标签组合与可见高亮。                                                                                                                                                                     |
|  17 | 页面忠实延续原型视觉系统                  | **PASS** | `docs/UI-REFERENCE.png`、`docs/UI-SPEC.md` 与 `globals.css` 对照；固定顶栏、216px 侧栏、蓝白 Token、单列卡片、阅读画布、右信息卡、状态色和密度保持一致；早期设计 QA 三轮比较已通过，v1.0.0 交付截图已按当前 UI 重拍。 |
|  18 | 桌面端和 390px 移动端                     | **PASS** | `npm run qa:capture` 生成 1440 首页/详情及 390 首页/导航/详情 5 张截图，`browserErrors: []`；脚本检查无框架错误覆盖层、正文非空、390px 无文档级横向溢出；Playwright 移动 E2E 也验证核心按钮与完整标签展开。                                                                                                                        |
|  19 | 密钥、数据库、构建产物和无关文件          | **PASS** | 密钥模式扫描只有文档术语/测试密码字段，无凭据；`.gitignore` 覆盖数据库/WAL/SHM、构建、报告和环境文件。`git ls-files` 确认 `data/` 下只跟踪 `.gitkeep`，真实数据库、构建与测试产物均为忽略文件。                                                                                                                                    |
|  20 | README 所有命令与项目一致                 | **PASS** | README 已压缩为介绍、快速开始、截图与限制，并与 `package.json`、便携打包命令、101/7 测试基线一致；详细运行说明指向 `docs/RUNNING.md`。 |

## 3. 最终验收清单 A–G

| 清单          | 状态     | 证据与说明                                                                                                                                       |
| ------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| A. 核心业务   | **PASS** | 创建、标题、正文、Markdown、图片/图表归档、SQLite、详情、源码、编辑、软删除/恢复、多标签、全部搜索字段、失败保留、重新提取均有集成或 E2E 证据。 |
| B. 提取质量   | **PASS** | 固定 HTML fixture + 本地 HTTP server 覆盖中英文、标题/列表/图片/代码/表格/侧栏、403/404/超时/非 HTML/超大响应/重定向/空页/登录页/畸形 HTML。 |
| C. 数据持久化 | **PASS** | 固定 `data/bookmarks.db`；Repository 关闭重开测试通过；生产服务两次启动间同一记录存在；便携包空库首次迁移与备份脚本说明齐全。 |
| D. 安全       | **PASS** | HTTP(S)、DNS/IP/重定向、超时/大小/次数、无 Cookie/无脚本执行、DOMPurify、Markdown 协议白名单均有代码与测试。 |
| E. 交互体验   | **PASS** | 加载/禁用/反馈、失败原因、软删除撤销、保存反馈、空状态、重新提取、移动抽屉、中文文案和键盘焦点均复核。 |
| F. 工程质量   | **PASS** | 迁移、类型、Lint、62 单元、39 集成、7 E2E、构建、setup/start、便携包外部验收和健康检查均通过；CI 与独立 E2E 工作流已补齐。 |
| G. 交付物     | **PASS** | 本地完整源码包、便携 ZIP 构建脚本、远程仓库、说明、截图、演示脚本、设计与 AI 记录齐全；Git 历史整理与正式 Release 留待第七阶段。 |

### Git 专项

| 项目                       | 状态        | 说明                                                                                                                |
| -------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------- |
| 数据库/密钥是否被 Git 提交 | **PASS**    | 当前目录是 Git 仓库；`git ls-files` 确认 `data/` 仅跟踪 `.gitkeep`，环境文件和真实数据库未被跟踪。                  |
| Git 提交历史体现开发过程   | **PARTIAL** | 当前 `main` 只有 `Initial url-bookmark release` 一次提交，能提供版本锚点，但不足以还原完整开发过程。                |
| 可远程访问的代码仓库       | **PASS**    | `origin` 为 `https://github.com/TTzz1z/url-bookmark.git`，`git ls-remote --heads origin` 已确认远程 `main` 可读取。 |

## 4. P1 与明确范围

| 项目                                                 | 状态               | 说明                                                                       |
| ---------------------------------------------------- | ------------------ | -------------------------------------------------------------------------- |
| 单篇 Markdown + Front Matter 下载                    | **PASS**           | `/api/bookmarks/[id]/export`，文件名清理与 UTF-8 下载头已实现。            |
| 提取状态筛选                                         | **PASS**           | success/partial/failed/pending 与关键词、标签组合查询已实现。              |
| 独立标签管理页面                                     | **PASS**           | 标签管理页支持使用次数、创建、重命名和确认删除，详情页继续支持添加与移除。 |
| 深色模式与本地图文包                                 | **PASS**           | 支持跟随系统/浅色/深色主题，以及单篇 Markdown 和 ZIP 图文包导出。          |
| Vega-Lite 动态图表归档                               | **PASS**           | 服务端提取 Vega-Lite、canvas 栅格化为 PNG 并写入本地 assets。              |
| Windows 便携 ZIP                                     | **PASS**           | 自带 Node.js x64；外部解压验收通过；不含开发者真实数据。                   |
| 收藏统计、FTS5、全库批量 ZIP                         | **NOT APPLICABLE** | 仍属于未进入本次交付的增强范围，不阻塞题目四项功能。                       |
| 登录、多人、云同步、AI、浏览器渲染抓取、完整网页归档 | **NOT APPLICABLE** | 设计中明确排除。                                                           |

## 5. 本轮发现并修复的缺陷

1. 正文搜索可命中但卡片未展示命中上下文：增加从备注/纯文本/Markdown 生成的
   查询摘要与高亮。
2. 危险 Markdown 图片协议产生空 `src` console error：改为不输出地址，并增加
   SSR/浏览器双层 XSS 测试。
3. 重新提取确认依赖预期 409，造成浏览器资源错误：客户端先读取
   `isContentEdited` 展示确认，服务端防线保留。
4. 只改备注/标签也会把正文误标为手改：只有 Markdown 内容真实变化才设置标志。
5. 侧栏超过 6 个标签无法访问：实现“更多标签/收起标签”及 `aria-expanded`。
6. 列表缺少更新时间：同时展示收藏时间和更新时间。
7. Zod 参数错误错误地成为 500：统一映射为 400 `VALIDATION_ERROR`。
8. DNS 超时阶段未立刻响应总超时：DNS 解析加入 AbortSignal 竞争。
9. Node 26 全新安装触发不必要 `node-gyp`：项目 `.npmrc` 使用依赖自带平台二进制，
   全新 `setup.bat` 已验证无需 C++ 工具链。
10. 验收目录残留数据库、构建和测试产物：最终清理，只保留 `data/.gitkeep`。

## 6. 最终交付结论

1. **是否满足题目四项功能要求：是，四项全部 PASS。**
2. **是否可以交付本地完整包：可以。** 源码路径与 Windows 便携 ZIP 均可运行；打包排除真实 `data/`。
3. **是否可以开始录屏：可以。** 建议先初始化固定演示数据；实时创建环节再使用本地 fixture 或真实公网文章。
4. **当前限制：** 不支持登录/付费墙/验证码/强动态页面；超限或不安全单图可能保留远程地址；LIKE 搜索未提供 FTS；Git 提交整理与正式 Release 留待第七阶段。
5. **稳定演示数据：**

   ```bash
   npm run db:seed:demo
   npm run start
   ```

   推荐展示：首页第一条“构建可靠的网址收藏工作流”；搜索“星图工作流”、
   `security.example` 或 `observable recovery path`；按“安全”标签筛选；查看
   `partial` 与 `failed` 示例。需要清除时执行：

   ```bash
   npm run db:clear:demo
   ```

   如需现场演示实时抓取，再在开发模式启用 `ALLOW_TEST_LOOPBACK=1` 并收藏
   `http://127.0.0.1:3000/api/test-fixture/article`。

   标题固定为“构建可靠的网址收藏工作流”，正文固定包含“持久化”“从输入到阅读”
   等搜索词。录屏结束停止服务并执行：

   ```powershell
   Remove-Item Env:ALLOW_TEST_LOOPBACK
   ```

6. **最终运行命令：**

Windows 推荐：

```text
setup.bat
start.bat
```

Windows 便携 ZIP（无需安装 Node.js）：解压后双击 `start.bat`；维护者构建命令为
`npm run package:portable`。

手动开发：

   ```bash
   npm install
   npm run db:migrate
   npm run dev
   ```

   手动生产：

   ```bash
   npm install
   npm run db:migrate
   npm run build
   npm run start
   ```

## 7. 本轮最终命令结果摘要

| 命令                               | 结果                                                             |
| ---------------------------------- | ---------------------------------------------------------------- |
| `npm install`                      | **PASS**，依赖与锁文件一致                                       |
| `npm run db:migrate`               | **PASS**，退出码 0                                               |
| `npm run typecheck`                | **PASS**，0 errors                                               |
| `npm run lint`                     | **PASS**，0 errors/warnings                                      |
| `npm run test:unit`                | **PASS**，8 files / 62 tests                                     |
| `npm run test:integration`         | **PASS**，4 files / 39 tests                                     |
| `npm run test:e2e`                 | **PASS**，Chromium 7/7                                           |
| `npm run build`                    | **PASS**，Next.js 16.2.12 production build                       |
| `npm run start` + `/api/health`    | **PASS**，3202 端口健康状态 `ok`；3000 端口既有进程保持运行      |
| `.github/workflows/ci.yml`         | **READY**，安装、迁移、类型、Lint、单元、集成、构建              |
| `.github/workflows/e2e.yml`        | **READY**，独立安装 Chromium 并运行 Playwright                   |
| `npm run db:seed:demo`（连续两次） | **PASS**，始终为 8 条书签、9 个标签、23 条关联                   |
| `npm run db:clear:demo`            | **PASS**，只清理 8 条演示书签和 9 个未使用演示标签，迁移记录保留 |
| `cmd.exe /d /c setup.bat`          | **PASS**，当前目录与全新临时目录均通过                           |
| `start.bat` + `/api/health`        | **PASS**，健康状态 `ok`                                          |
| 生产服务停止/重启持久化            | **PASS**，同一书签 ID 重启后可读                                 |
| `npm run package:portable`         | **PASS**，约 76.8 MB ZIP，SHA256 已生成，不含用户数据库  |
| `npm run verify:portable`（外解压）| **PASS**，health/home/storage/空库迁移/SQLite ok         |
| 第六阶段双路径运行时验收           | **PASS**，源码生产与便携包：建库/收藏/标签搜索/重启/备份恢复/端口占用检测 |
