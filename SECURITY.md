# 安全政策

## 支持范围

项目正式发布前以 `main` 分支为准；发布 `v1.0.0` 后，仅维护最新的 1.x 版本。
旧版本不承诺获得安全修复。

## 报告安全问题

请优先使用 GitHub 仓库的 **Security → Report a vulnerability** 私密报告入口，
不要在公开 Issue 中粘贴利用代码、个人数据库、访问令牌或尚未修复的漏洞细节。
报告请至少包含：受影响版本、复现条件、实际影响和建议的修复方向。

普通功能缺陷可以通过
[GitHub Issues](https://github.com/TTzz1z/url-bookmark/issues) 提交。

## 已实施的主要边界

- 仅允许 HTTP/HTTPS，逐次校验域名、DNS 全部结果、目标 IP 和每次重定向；
- 默认拒绝本机、内网、链路本地、保留地址和云元数据地址；
- 不携带用户 Cookie，不执行目标网页 JavaScript，不直接保存或渲染原始 HTML；
- Readability 输出经 DOMPurify 清理，Markdown 渲染禁用原始 HTML并限制协议；
- 抓取和图片下载受超时、跳转次数、单文件和总容量限制；
- `ALLOW_TEST_LOOPBACK` 仅供非生产测试，生产模式不会放行本机地址；
- 真实 SQLite 数据库、WAL/SHM、图片和环境文件均被 Git 忽略。

## 部署提示

这是单用户本地优先应用。若将其公开部署，必须额外增加身份验证、访问速率限制、
持久存储、网络出口隔离和滥用监控；不要把默认本地配置直接暴露到公网。

依赖检查应使用官方 npm registry：

```bash
npm audit --omit=dev --registry=https://registry.npmjs.org
```
