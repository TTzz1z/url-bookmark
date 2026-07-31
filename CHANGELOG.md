# 更新日志

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 的组织方式，
正式版本使用语义化版本号。

## [1.0.0] - 2026-07-31

v1.0.0 正式交付。源码仓库与 Windows x64 便携 ZIP 两条运行路径均已落地并通过
第六阶段全新环境验收。

### 新增

- 粘贴 HTTP/HTTPS 网址，自动获取标题，Readability 正文提取并保存为 Markdown；
- 标签添加/移除/筛选，以及独立标签管理（创建、重命名、确认删除、使用次数）；
- 标题、URL、域名、正文、备注、标签的 LIKE 搜索与提取状态筛选；
- 书签增删改、重新提取、软删除约 10 分钟内可撤销恢复；
- SQLite 本地持久化；正文图片与 Vega-Lite 动态图表有界归档到 `data/assets/`；
- 单篇 Markdown 下载与 ZIP 图文包导出；存储用量接口；
- URL / DNS / IP / 重定向 SSRF 防护；DOMPurify 与 Markdown 渲染 XSS 防护；
- 同源同系列分页合并（最多 10 页）；懒加载图片与安全 SVG 处理；
- 对强反爬站点的浏览器头与受限 `curl` 回退（仍保持 SSRF 边界）；
- 浅色/深色主题、键盘快捷键、桌面与 390px 移动布局；
- Windows `setup.bat` / `start.bat`；自带 Node.js 的 x64 便携 ZIP（`start.bat`、
  `backup.bat`、`restore.bat`，批处理提示为 ASCII 以兼容 `cmd.exe`）；
- 演示数据脚本、常规 CI 与独立 Playwright E2E 工作流。

### 安全与依赖

- 使用依赖覆盖固定 PostCSS 8.5.25 与 Sharp 0.35.3；官方 npm 审计 0 漏洞；
- 便携打包闸门拒绝真实 `bookmarks.db` 与用户图片进入发布 ZIP。

### 验证结果

- 单元测试 62、集成测试 39，合计 **101** 项通过；
- Playwright E2E **7** 项通过；
- TypeScript、ESLint、Prettier、生产构建通过；
- 便携包外部解压验收：health、首页、storage、空库迁移与 SQLite 完整性通过。

### 已知限制

- 登录墙、验证码、强反爬与纯 JS 页面可能无法提取；
- 超限、鉴权失败或不安全资源可能保留远程图片 URL；
- 搜索为 LIKE，未提供 FTS5；未提供首页统计仪表盘与全库批量 ZIP；
- 单用户本地应用，无注册、云同步或 AI 功能。

## [Unreleased]

暂无。

[1.0.0]: https://github.com/TTzz1z/url-bookmark/releases/tag/v1.0.0
[Unreleased]: https://github.com/TTzz1z/url-bookmark/compare/v1.0.0...HEAD
