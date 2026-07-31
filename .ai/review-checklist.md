# AI 交付复核清单

- [x] 原始需求、两份文档和原型图已完整读取
- [x] Docker 范围已从文档与实现中移除
- [x] SQLite 文件路径和忽略规则已核对
- [x] URL、DNS、IP、重定向与响应限制已测试
- [x] 原始 HTML 未直接渲染
- [x] Markdown 原始 HTML 禁用，危险 URL 被过滤
- [x] 失败记录保留，用户手改正文有覆盖保护
- [x] 标签、正文搜索与组合筛选由真实数据库驱动
- [x] TypeScript、ESLint、62 项单元、39 项集成和 7 条核心 E2E 已执行
- [x] 最小 GitHub Actions 已覆盖安装、迁移、类型、Lint、单元、集成和构建
- [x] Playwright 浏览器安装与 E2E 已拆分为可独立运行的工作流
- [x] 桌面/390px 首页、导航、详情截图和控制台错误已检查
- [x] 临时全新目录安装、原生 SQLite 加载、迁移、类型检查和构建已执行
- [x] 设计 QA 通过
- [x] 生产启动与重启持久化在最终收口命令中复核
- [x] 真实数据库由 Git 忽略并单独备份，测试报告和临时构建不进入交付包
- [x] Windows 便携 ZIP 构建闸门拒绝用户数据库；外部解压验收 health/storage/空库通过
- [x] README / DESIGN / AI-USAGE / CHANGELOG / 验收报告已与 v1.0.0 实现对齐
