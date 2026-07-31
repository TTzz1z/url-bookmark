# 网址收藏夹

一个本地优先的网址收藏与正文阅读工具。粘贴 HTTP/HTTPS 网址后，应用会在服务端
执行安全检查、抓取网页、提取主要正文、清理不可信 HTML、转换为 Markdown，并
持久化到 SQLite。书签可以继续添加标签、搜索、编辑、重新提取、导出或删除。

![首页](demo/screenshots/home.png)

![详情阅读模式](demo/screenshots/detail.png)

## 核心能力

- URL 规范化、去除 fragment 与重复网址拦截；
- DNS/IP/重定向三层 SSRF 防护；
- 受超时、响应体大小和重定向次数限制的 HTTP 抓取；
- Mozilla Readability 正文提取；
- DOMPurify 清理与 Turndown/GFM Markdown 转换；
- 同源同文章系列的数字分页/“下一页”自动合并，最多 10 页；
- 正文图片安全下载到本地、Markdown 地址改写与 ZIP 图文包导出；
- `pending / success / partial / failed` 完整状态；
- 标题、原始/最终 URL、域名、正文、备注和标签 LIKE 搜索；
- 多标签添加、移除与筛选；标签 API 支持重命名和删除；
- 阅读模式、Markdown 源码与编辑模式；
- 删除二次确认、重新提取与用户手改正文覆盖保护；
- SQLite 本地持久化与单篇 Markdown 下载；
- 1440/1280 桌面布局与最低 390px 移动布局。

## 技术栈

Next.js 16、React 19、TypeScript、SQLite、Drizzle ORM、Undici、JSDOM、
Mozilla Readability、DOMPurify、Turndown、React Markdown、Vitest 与 Playwright。

## 环境要求

- Node.js 22 或更高版本；
- npm 11（其他兼容 npm 版本也可）；
- 无需 PostgreSQL、Redis、付费 API、AI 模型或第三方账号。

项目级 `.npmrc` 已设置 `ignore-scripts=true`。当前锁定依赖自带 Windows x64/arm64、
Linux x64/arm64 与 macOS x64/arm64 所需的平台二进制，因此全新安装不需要
Visual Studio C++ 工具链，也避免 npm 在新版本 Node.js 上执行不必要的
`node-gyp` 回退编译。

## 本地开发

```bash
npm install
npm run db:migrate
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)。

## 生产运行

```bash
npm run build
npm run start
```

生产服务默认同样使用 3000 端口。若需指定端口：

```bash
npm run start -- -p 3200
```

## Windows 一键脚本

```text
setup.bat
start.bat
```

- `setup.bat` 检查 Node.js/npm、安装依赖并执行数据库迁移；
- `start.bat` 确保数据库就绪，在缺少生产构建时先构建，再启动服务；
- 任一步骤失败都会显示清晰错误并返回非零退出码。

## 使用流程

1. 在首页粘贴一个公开的 HTTP/HTTPS 文章网址；
2. 等待标题和正文提取完成；
3. 打开详情，在“编辑模式”添加标签、备注或修改 Markdown；
4. 返回首页，用正文关键词搜索，或点击左侧标签筛选；
5. 对失败/部分提取的记录查看错误、手动编辑或重新提取；
6. 需要移除记录时通过二次确认删除。

## 数据目录、备份与恢复

数据库固定保存在：

```text
data/bookmarks.db
```

应用首次迁移时会自动创建 `data/`。刷新页面、关闭浏览器以及重启 Node 服务后，
数据仍然存在。真实数据库以及 `db-wal`、`db-shm` 文件均被 `.gitignore` 排除。

备份步骤：

1. 停止应用，避免复制过程中仍有写入；
2. 复制整个 `data/` 目录到安全位置，其中包括 `bookmarks.db` 和正文图片
   `assets/`；
3. 如存在 `bookmarks.db-wal`，先正常停止应用或同时备份相关文件。

恢复步骤：

1. 停止应用；
2. 将备份中的 `bookmarks.db` 和 `assets/` 放回 `data/`；
3. 执行 `npm run db:migrate`；
4. 重新启动应用并检查书签列表。

## 抓取与安全边界

抓取服务只允许 HTTP/HTTPS，不发送用户 Cookie，不执行目标网页 JavaScript，
也不保存或直接渲染远程原始 HTML。

每次请求都会：

1. 规范化网址并检查危险主机名；
2. DNS 解析全部地址并拒绝回环、私有、链路本地、保留地址和元数据地址；
3. 若本机代理把域名全部映射到 `198.18.0.0/15` Fake-IP 段，则通过固定可信
   DoH 获取真实地址，并再次执行相同的公网 IP 校验；
4. 将 Undici 连接固定到已检查的地址，减少 DNS 重绑定窗口；
5. 对每一次重定向重新执行上述检查；
6. 限制总超时、重定向次数和最大响应体；
7. 拒绝非 HTML 响应；
8. 使用 DOMPurify 清理内容，再转换为 Markdown；
9. React Markdown 禁用原始 HTML，并限制可渲染 URL 协议。

遇到数字分页或“下一页”文章时，应用会识别属于同一域名、同一文章 URL
系列的分页，逐页重新执行安全检查并合并为一篇 Markdown。自动合并最多
10 页，不会跟随站外链接或无限翻页。

正文转换完成后，应用会对 Markdown 中的 HTTP/HTTPS 图片再次执行相同的
DNS/IP/重定向安全检查，然后下载到 `data/assets/<书签ID>/`。每篇最多归档
60 张图片，单张最多 8 MB，总计最多 50 MB；只接受通过文件签名验证的
PNG、JPEG、GIF、WebP 和 AVIF，不归档 SVG。下载失败的单张图片保留远程地址，
不会导致整篇正文丢失。

详情页使用本地受控图片接口显示归档资源。普通“下载 .md”保留应用内图片地址；
需要在其他电脑或 Markdown 编辑器中完整携带图片时，使用“下载图文包”，ZIP
中包含 `.md` 与 `assets/` 目录，Markdown 已改写为相对路径。

Fake-IP 兼容不会放行直接输入的 `198.18.x.x`，也不会放行 localhost、内网 IP
或重定向到内网的目标。只有系统 DNS 的全部结果都位于 Fake-IP 段时才会启用可信
解析，解析后的任一地址不安全仍会拒绝请求。

自动化 E2E 使用 `ALLOW_TEST_LOOPBACK=1` 访问本地 fixture。该开关只在非生产环境、
Playwright 配置中显式提供；默认值为 0，生产环境即使设置也不会放行。

## 测试和质量检查

```bash
npm run typecheck
npm run lint
npm run test:unit
npm run test:integration
npm run test:e2e
npm run build
```

测试 fixture 覆盖普通文章、导航/侧栏、代码块、表格、懒加载/占位图片、分页文章、空页面、
登录提示、畸形 HTML、403、404、超时、非 HTML、超大响应、重定向循环以及
重定向到内网。

核心 E2E 会真实完成：

```text
打开首页 → 收藏本地文章 → 提取标题/Markdown → 添加标签 → 打开详情
→ 返回首页 → 搜索正文 → 按标签筛选
```

当前 4 条 Playwright 场景还覆盖：正文图片本地化和删除级联清理、删除二次确认、
SSRF 拦截后失败书签保留与手动补充、用户 Markdown XSS、手改正文覆盖确认，以及
390px 首页/详情和完整标签展开。

## 稳定演示数据

项目提供显式、可重复、无需外网的演示数据初始化命令：

```bash
npm run db:seed:demo
```

该命令会先执行迁移，再写入 8 条固定演示书签，覆盖中文与英文正文、标签、备注、
`success / partial / failed` 提取状态、代码块和表格。演示网址统一使用 IANA
保留的 `.example` 域名；初始化不会访问这些网址，正文已经安全地保存在 SQLite，
因此截图和录屏不受公网状态影响。

重复执行该命令不会增加重复记录，而是把固定演示记录恢复为标准状态。适合在每次
录屏前重置标题、正文、备注、状态和标签。脚本不会修改普通书签；如果固定 ID 或
固定演示 URL 与普通数据冲突，会在事务中整体中止并给出错误。

仅清除演示数据：

```bash
npm run db:clear:demo
```

清理命令只删除 ID 与演示 URL 双重匹配的书签。演示脚本创建且已经没有关联的标签
会一并清理；录屏前已存在的同名标签会被复用，仍被普通书签使用的标签会保留。
普通书签、普通标签和迁移记录不会被删除。

推荐的稳定演示入口：

- 首页第一条：`构建可靠的网址收藏工作流`；
- 正文搜索：`星图工作流`、`结构化正文` 或 `observable recovery path`；
- 域名搜索：`security.example`；
- 标签筛选：`安全`、`SQLite` 或 `产品设计`；
- 状态筛选：`部分提取` 与 `提取失败`；
- 持久化：重启服务后搜索 `离线优先恢复`。

如需演示“粘贴 URL → 实时抓取”的完整创建过程，仍可使用仓库内测试 fixture。该
模式只用于开发或自动化会话：

```powershell
$env:ALLOW_TEST_LOOPBACK="1"
npm run dev
```

随后收藏
`http://127.0.0.1:3000/api/test-fixture/article`。录屏结束并停止服务后执行
`Remove-Item Env:ALLOW_TEST_LOOPBACK`；该开关在生产模式无效。

若要重新生成桌面与 390px QA 截图，请保持上述 fixture 开发服务运行，再执行：

```bash
npm run qa:capture
```

## 环境变量

复制 `.env.example` 为 `.env.local` 后可按需调整：

| 变量 | 默认值 | 说明 |
|---|---:|---|
| `DATABASE_PATH` | `./data/bookmarks.db` | SQLite 文件路径 |
| `FETCH_TIMEOUT_MS` | `12000` | 抓取总超时 |
| `FETCH_MAX_BYTES` | `5242880` | 最大响应体 |
| `FETCH_MAX_REDIRECTS` | `5` | 最大重定向次数 |
| `ALLOW_TEST_LOOPBACK` | `0` | 仅自动化测试使用 |

## 项目结构

```text
src/app/          页面与 Route Handlers
src/components/   首页、详情、状态和通用组件
src/db/           Drizzle Schema、连接和 Repository
src/services/     书签业务、抓取、安全与正文提取
drizzle/          SQLite 迁移
tests/            unit / integration / e2e / fixtures
docs/             设计、验收、UI 规范与实施计划
demo/             最终截图与演示脚本
.ai/              真实 AI 协作记录
data/             本地数据库目录（只提交 .gitkeep）
```

## 已知限制

- 登录、验证码、付费墙、强反爬和纯 JavaScript 页面可能无法提取；
- 不执行浏览器渲染抓取，不保证覆盖所有网站；
- 自动分页只跟随同源、同文章系列 URL，最多合并 10 页；超过上限的分页仍可
  通过正文中的原始链接访问；
- 正文图片会尽量本地化，但超过数量/容量限制、不受支持的 SVG、鉴权图片或下载
  失败的单张图片仍保留远程 URL；
- Readability 可能误判复杂页面，因而提供手动编辑和重新提取；
- P0 搜索使用 SQLite LIKE，适合本地数千条数据；FTS5 仍是未来优化；
- 标签重命名和删除已有 API，但当前没有独立标签管理页面；
- 单用户本地应用，不包含注册、权限、云同步、AI 摘要或自动标签。

## 常见问题

- **`better-sqlite3` 无法加载**：先确认使用 Node.js 22+、受支持的 x64/arm64
  平台，并保持项目 `.npmrc` 的 `ignore-scripts=true`；随后删除未完成的
  `node_modules`，重新执行 `npm install`。当前交付已在全新目录验证无需本机
  C++ 构建工具。
- **3000 端口被占用**：停止占用进程，或使用 `npm run dev -- -p 3200`。
- **某个网站返回 403**：目标网站拒绝普通 HTTP 抓取；书签仍会以失败状态保留。
- **正文里仍有远程图片或破图**：该图片可能超过限制、类型不受支持或需要鉴权。
  重新提取会再次尝试；已成功归档的图片可通过“下载图文包”一起导出。
- **正常公网网站被提示内网地址**：常见原因是 Clash/TUN 的 Fake-IP DNS。当前版本
  会自动通过可信 DoH 获取真实公网地址后继续安全校验；请重新提取旧的失败书签。
  若可信 DNS 也无法访问，应用会返回 `DNS_FAILED`，不会降低 SSRF 防护等级。
- **重新提取提示覆盖**：正文已经手动编辑；只有明确确认后才会覆盖。
- **数据库被锁定**：关闭其他运行中的项目实例后重试迁移或备份。

设计与验收说明见 [docs/DESIGN.md](docs/DESIGN.md)、
[docs/UI-SPEC.md](docs/UI-SPEC.md) 和
[FINAL-ACCEPTANCE-REPORT.md](FINAL-ACCEPTANCE-REPORT.md)。
