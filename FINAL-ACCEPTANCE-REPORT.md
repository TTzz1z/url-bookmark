# 网址收藏夹最终独立验收报告

**验收日期：** 2026-07-30  
**验收方式：** 不采信旧完成汇报，重新读取需求、验收清单、UI 规范、原型、全部
源码/迁移/脚本/测试，并实际执行数据库、静态检查、自动化、构建、启动、重启与
浏览器取证。  
**最终结论：** 题目四项核心功能全部 **PASS**；本地源码完整包可以交付，可以
开始录屏。独立标签管理页等未实现 P1 不阻塞本次 P0 交付。

状态定义：

- **PASS**：真实实现且有本轮命令、测试、文件或浏览器行为证据；
- **PARTIAL**：部分实现，仍有明确缺口；
- **FAIL**：要求范围内未实现或本轮验证失败；
- **NOT APPLICABLE**：明确不在本次范围，或当前目录没有相应对象可验收。

## 1. 题目四项功能要求

| 功能要求 | 状态 | 本轮真实证据 |
|---|---|---|
| 粘贴网址并收藏，自动获取标题 | **PASS** | `src/services/bookmark-service.ts` 先写 `pending`，再调用提取并持久化；`src/services/extraction-service.ts` 实现 `og:title → twitter:title → title → Readability/域名`；Playwright“收藏、提取、加标签、详情、正文搜索与标签筛选”实际得到“构建可靠的网址收藏工作流”。 |
| 提取网页主要正文并转换、保存 Markdown | **PASS** | `src/services/extraction-service.ts` 使用 Readability、DOMPurify、Turndown/GFM，并对同源同文章系列分页做最多 10 页的受限合并；迁移字段 `markdown_content`；单元测试覆盖正文、侧栏、代码、表格、懒加载/占位图片、分页与畸形 HTML。真实游民星空 9 页攻略合并为 9 个页标题、43 张原图，浏览器 43/43 加载成功且无 console error。 |
| 添加一个或多个标签并按标签整理 | **PASS** | `tags`、`bookmark_tags` 迁移与 `setBookmarkTags`；详情编辑可添加/移除多个标签，侧栏可筛选并展开全部标签；核心 E2E 添加“端到端测试, 阅读”并按标签再次找到书签。 |
| 关键词搜索并重新找到收藏 | **PASS** | `src/db/repository.ts` 参数化 LIKE 覆盖标题、原始 URL、最终 URL、域名、Markdown、备注、标签；集成测试逐字段验证；浏览器实际搜索正文“持久化”并显示命中上下文高亮。 |

## 2. 本次 20 项独立验收

| # | 验收项 | 状态 | 本轮真实证据 |
|---:|---|---|---|
| 1 | 对照原始要求逐项确认真实实现 | **PASS** | 完整复核 `docs/DESIGN.md`、`.ai/prompts/initial-brief.md`、API、服务、Repository、页面、迁移和测试；四项功能见第 1 节。 |
| 2 | 对照最终验收清单逐项检查 | **PASS** | `docs/TASKS-AND-ACCEPTANCE.md` 的 A–F P0 均由本轮命令、测试或浏览器证据覆盖；G 中 Git 仓库项单列为 NOT APPLICABLE，见第 3 节。 |
| 3 | 实际运行数据库迁移 | **PASS** | `npm run db:migrate` 退出码 0，输出 `数据库已就绪：E:\url-bookmark\data\bookmarks.db`；全新临时目录中的 `setup.bat` 也成功创建数据库。 |
| 4 | 实际运行 TypeScript 检查 | **PASS** | `npm run typecheck` 退出码 0、0 个 TypeScript 错误；修复后及全新目录均再次通过。 |
| 5 | 实际运行 ESLint | **PASS** | `npm run lint` 退出码 0、0 个 ESLint 错误/警告。 |
| 6 | 实际运行单元测试 | **PASS** | `npm run test:unit`：6 个文件、44 项测试全部通过；覆盖 DNS 多地址、代理 Fake-IP 可信解析、内网回退阻断、Markdown XSS、图片本地化/去重/失败保留/清理/数据库隔离、占位图原图恢复、分页合并与 API 400 映射。 |
| 7 | 实际运行集成测试 | **PASS** | `npm run test:integration`：4 个文件、27 项测试全部通过；覆盖安全抓取、Repository、失败保留、重提取保护，以及演示数据重复初始化、安全清理和冲突回滚。 |
| 8 | 实际运行核心 Playwright E2E | **PASS** | `npm run test:e2e`：Chromium 4/4 通过；成功 CRUD、SSRF 失败保留、XSS、390px 首页/详情均通过，页面错误和 console error 数组为空。 |
| 9 | 实际运行生产构建 | **PASS** | `npm run build` 退出码 0；Next.js 16.2.12 编译、TypeScript、7 个静态页面生成阶段全部成功，所有页面/API 路由列出。 |
| 10 | 检查 `setup.bat` 和 `start.bat` | **PASS** | 当前目录 `cmd.exe /d /c setup.bat` 退出码 0；临时全新副本原样运行时安装 555 个包、迁移成功、`better-sqlite3 load: ok`；`start.bat` 启动后 `/api/health` 返回 `{"status":"ok"}`。端口占用时脚本也正确非零退出并显示原因。 |
| 11 | 关闭并重启服务后 SQLite 数据仍存在 | **PASS** | 生产端口 3201 创建 ID `9adb4ec5-d8d9-4618-86bd-0b1d31de4028` 的 `failed` 书签；停止 PID 树、重新 `npm run start -- -p 3201` 后按同一 ID 读取成功；随后 API 清理回 0 条。 |
| 12 | SSRF 覆盖 DNS、IP、重定向 | **PASS** | `url-security-service.ts` 校验协议/主机、DNS 全部地址、IPv4/IPv6/映射地址；系统 DNS 全部落入 `198.18/15` 时通过固定可信 DoH 获取真实地址后再次校验，直接 Fake-IP、可信解析返回内网及混合内网结果仍被拦截；`fetch-service.ts` 固定到已审查地址并对每次重定向重查。真实验证 `sspai.com` 与 `www.anthropic.com` 均成功提取 Markdown。 |
| 13 | Markdown 渲染 XSS | **PASS** | 入库前 DOMPurify；`MarkdownView` 使用 `skipHtml`，链接仅允许 HTTP(S)/mailto/hash，图片仅允许 HTTP(S) 或严格匹配的本地资源路由；本地资源设置 `nosniff` 和沙箱 CSP。单元与 E2E 确认无 script、onerror、javascript/data/mailto 图片和 console error。 |
| 14 | 抓取失败时保留书签 | **PASS** | `createBookmark` 在抓取前插入 `pending`，`extractUrl` 把异常转为 `failed` 再更新；集成测试“抓取失败时仍保留 failed 书签、标签和错误信息”；E2E 私网地址页面仍可打开、加备注和手写 Markdown。 |
| 15 | 用户 Markdown 不会被重提取静默覆盖 | **PASS** | `is_content_edited` 持久化；服务端无确认返回 `CONTENT_EDITED`，失败重试保留手写正文；客户端已编辑时直接显示覆盖确认；集成测试及核心 E2E 均验证。仅修改备注/标签不再误标正文为已编辑。 |
| 16 | 搜索覆盖标题、URL、域名、正文、备注、标签 | **PASS** | `repository.test.ts` 逐字段验证标题、原始 URL、最终 URL、域名、Markdown、备注、标签；SQL 使用绑定参数和 LIKE 转义；核心 E2E 验证正文命中、标签组合与可见高亮。 |
| 17 | 页面忠实延续原型视觉系统 | **PASS** | `docs/UI-REFERENCE.png`、`docs/UI-SPEC.md` 与 `globals.css` 对照；固定顶栏、216px 侧栏、蓝白 Token、单列卡片、阅读画布、右信息卡、状态色和密度保持一致；`design-qa.md` 原三轮比较通过，本轮又重拍并人工复核。 |
| 18 | 桌面端和 390px 移动端 | **PASS** | `npm run qa:capture` 生成 1440 首页/详情及 390 首页/导航/详情 5 张截图，`browserErrors: []`；脚本检查无框架错误覆盖层、正文非空、390px 无文档级横向溢出；Playwright 移动 E2E 也验证核心按钮与完整标签展开。 |
| 19 | 密钥、数据库、构建产物和无关文件 | **PASS** | 密钥模式扫描只有文档术语/测试密码字段，无凭据；`.gitignore` 覆盖数据库/WAL/SHM、构建、报告和环境文件。当前工作副本为截图/录屏显式保留了已初始化的 `data/bookmarks.db`，它不会进入源码交付清单；E2E 数据库、`.qa`、`test-results` 与 `tsconfig.tsbuildinfo` 已在验证后清理。 |
| 20 | README 所有命令与项目一致 | **PASS** | `npm install`、`db:migrate`、`db:seed:demo`、`db:clear:demo`、`dev`、`build`、`start`、指定端口、全部测试与 `qa:capture` 均对应 `package.json`；关键命令均已实际执行。README 已说明稳定演示数据、实时 fixture 与准确 P1 限制。 |

## 3. 最终验收清单 A–G

| 清单 | 状态 | 证据与说明 |
|---|---|---|
| A. 核心业务 | **PASS** | 创建、标题、正文、Markdown、SQLite、详情、源码、编辑、删除、多标签、全部搜索字段、失败保留、重新提取均有 27 项集成测试或 4 条 E2E 证据。 |
| B. 提取质量 | **PASS** | 8 个固定 HTML fixture + 本地 HTTP server 覆盖中英文、标题/列表/图片/代码/表格/侧栏、403/404/超时/非 HTML/超大响应/重定向/空页/登录页/畸形 HTML。 |
| C. 数据持久化 | **PASS** | 固定 `data/bookmarks.db`；Repository 关闭重开测试通过；生产服务两次启动间同一记录存在；备份恢复说明准确。 |
| D. 安全 | **PASS** | HTTP(S)、DNS/IP/重定向、超时/大小/次数、无 Cookie/无脚本执行、DOMPurify、Markdown 协议白名单均有代码与测试。 |
| E. 交互体验 | **PASS** | 加载/禁用/反馈、失败原因、删除确认、保存反馈、空状态、重新提取、移动抽屉、中文文案和键盘焦点均复核；移动触控目标已补强。 |
| F. 工程质量 | **PASS** | 迁移、类型、Lint、44 单元、27 集成、4 E2E、构建、setup/start、全新安装、健康检查均通过；非演示运行生成物已清理。 |
| G. 交付物 | **PARTIAL** | 本地完整源码包、说明、截图、演示脚本、设计与 AI 记录齐全；但当前目录不是 Git 仓库，无法提供真实 Git URL 或提交历史。该缺口不影响本地包运行。 |

### Git 专项

| 项目 | 状态 | 说明 |
|---|---|---|
| 数据库/密钥是否被 Git 提交 | **NOT APPLICABLE** | 当前目录没有 `.git`，无法声称“未提交”；只能确认交付目录已清理且 `.gitignore` 正确。 |
| Git 提交历史体现开发过程 | **NOT APPLICABLE** | 无 Git 元数据，本轮没有伪造仓库或历史。 |
| 可远程访问的代码仓库 | **NOT APPLICABLE** | 用户要求的是本地完整包，本轮未获授权创建/推送远程仓库。 |

## 4. P1 与明确范围

| 项目 | 状态 | 说明 |
|---|---|---|
| 单篇 Markdown + Front Matter 下载 | **PASS** | `/api/bookmarks/[id]/export`，文件名清理与 UTF-8 下载头已实现。 |
| 提取状态筛选 | **PASS** | success/partial/failed/pending 与关键词、标签组合查询已实现。 |
| 独立标签管理页面 | **PARTIAL** | 服务端已有标签重命名、删除与使用次数 API；页面支持添加、移除、筛选和展开全部标签，但没有独立重命名/删除 UI。 |
| 首页统计、FTS5、深色模式、批量 ZIP | **NOT APPLICABLE** | 文档明确列为未进入本次交付的 P1，不阻塞题目四项功能。 |
| 登录、多人、云同步、AI、浏览器渲染抓取、完整网页归档 | **NOT APPLICABLE** | 设计中明确排除。 |

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
2. **是否可以交付本地完整包：可以。** 源码、锁文件、迁移、脚本、测试、文档和
   截图齐全；打包时排除已忽略的 `node_modules/`。
3. **是否可以开始录屏：可以。** 建议先初始化固定演示数据；实时创建环节再使用本地 fixture，均不依赖外网。
4. **当前限制：** 不支持登录/付费墙/验证码/强动态页面；超限、SVG、鉴权或下载
   失败的单张图片仍保留远程地址；Readability 可能误判复杂页面；LIKE 搜索适合本地数千条，不提供 FTS 排名；
   没有独立标签管理页、Git 仓库或远程部署。
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

| 命令 | 结果 |
|---|---|
| `npm run db:migrate` | **PASS**，退出码 0 |
| `npm run typecheck` | **PASS**，0 errors |
| `npm run lint` | **PASS**，0 errors/warnings |
| `npm run test:unit` | **PASS**，6 files / 44 tests |
| `npm run test:integration` | **PASS**，4 files / 27 tests |
| `npm run test:e2e` | **PASS**，Chromium 4/4 |
| `npm run build` | **PASS**，Next.js 16.2.12 production build |
| `npm run db:seed:demo`（连续两次） | **PASS**，始终为 8 条书签、9 个标签、23 条关联 |
| `npm run db:clear:demo` | **PASS**，只清理 8 条演示书签和 9 个未使用演示标签，迁移记录保留 |
| `cmd.exe /d /c setup.bat` | **PASS**，当前目录与全新临时目录均通过 |
| `start.bat` + `/api/health` | **PASS**，健康状态 `ok` |
| 生产服务停止/重启持久化 | **PASS**，同一书签 ID 重启后可读 |
| `npm run qa:capture` | **PASS**，5 张截图，`browserErrors: []` |
