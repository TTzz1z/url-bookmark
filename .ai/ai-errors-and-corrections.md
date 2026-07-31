# AI 错误与修正记录

只记录本次实际发生并通过命令、测试或浏览器检查发现的问题。

| 问题 | 发现方式 | 修正 | 验证 |
|---|---|---|---|
| 附件首次读取出现中文乱码 | PowerShell 输出肉眼检查 | 显式设置 UTF-8 后重新完整读取 | 正确显示全部中文需求 |
| 初始使用 ESLint 10，与 Next 插件的 React 规则不兼容 | `npm run lint` 抛出 `getFilename is not a function` | 固定 ESLint 9.39.2 | `npm run lint` 通过 |
| DNS 返回类型与 Readability 可空字段的 TypeScript 处理不完整 | `npm run typecheck` | 收窄 IPv4/IPv6 类型并处理 `null` | `npm run typecheck` 通过 |
| Undici dispatcher 在读取流之前关闭 | 代码审查抓取生命周期时发现 | 将响应处理与限流读取放在 dispatcher 关闭之前 | 403/404/超时/大响应/重定向集成测试通过 |
| Readability 丢失代码块语言，畸形 HTML 返回空 Markdown | fixture 单元测试失败 | 提取前保存语言属性，并为 Readability 失败增加清理后的 body 降级转换 | 28 项单元测试通过 |
| Repository 参数化测试在 `beforeAll` 前捕获了未初始化 ID | 集成测试显示期望值为 `undefined` | 用记录别名在测试执行时解析真实 ID | 19 项集成测试通过 |
| Playwright 使用模糊 role/label 定位，命中多个元素 | E2E strict mode 失败 | 使用 exact、heading level 与明确 textbox role | 核心 E2E 通过 |
| QA 截图脚本使用 CJS 不支持的 top-level await | `tsx scripts/capture-qa.ts` 构建失败 | 包装为异步 `main()` | 四张浏览器截图成功生成 |
| 首轮详情页把返回与动作单独占一行，偏离原型层级 | 同视口组合截图设计 QA | 返回移入顶栏，标题与动作同层；随后对齐内容轨道和激活导航 | `design-qa.md` 第三轮 `passed` |
| 首次停止开发服务的进程筛选把当前 PowerShell 也匹配进去 | 命令提前退出且目标 Node 仍存在 | 重新只检查 node/cmd，核对 PID 树后逐个停止 | 目标开发服务被完整停止 |
| 首版 Windows 批处理包含无 BOM 的 UTF-8 中文，`cmd.exe` 将乱码片段误当成命令且错误地返回 0 | 真实执行 `setup.bat` | 将批处理命令和错误提示改为兼容所有 Windows 代码页的 ASCII 英文 | 再次执行脚本，安装与迁移步骤真实完成 |
| 搜索能命中正文，但卡片始终优先显示 description，用户看不到命中高亮 | 扩展 Playwright 在“持久化”正文搜索后找不到 `mark.search-highlight` | 根据查询从备注/纯文本/Markdown 生成命中上下文摘要并高亮 | 4 条 Playwright E2E 全部通过 |
| 被拒绝的 Markdown 图片协议被转换为空 `src`，React 记录控制台错误 | XSS E2E 的 console 监听捕获两条空 `src` 错误 | URL transform 对危险图片返回 `undefined`，保留无可执行地址的降级节点 | XSS DOM 断言通过且浏览器错误数组为空 |
| 手改正文的覆盖确认先请求服务端 409，虽被 UI 处理仍产生浏览器资源错误 | 核心 E2E console 监听捕获预期 409 | 客户端依据已加载的 `isContentEdited` 直接打开确认框；服务端 409 继续作为绕过 UI 的防线 | 核心 E2E 无控制台错误，服务层拒绝测试仍通过 |
| Node 26 全新目录执行普通安装时 `better-sqlite3` 不必要地回退到 `node-gyp`，缺少 C++ 工具链导致失败 | 临时干净目录真实运行 `setup.bat` | 增加项目 `.npmrc` 的 `ignore-scripts=true`，使用锁定依赖自带的平台二进制 | 全新目录安装 555 个包，原生模块加载、迁移、类型检查和生产构建通过 |
