# 演示脚本（约 3 分钟）

## 准备

```bash
npm install
npm run db:migrate
npm run db:seed:demo
npm run dev
```

打开 `http://localhost:3000`。演示书签已经存入 SQLite，不需要等待或访问公网。
每次重录前可再次执行 `npm run db:seed:demo`，将演示记录恢复为相同内容。

## 主流程

1. 展示首页 8 条演示书签、左侧标签区、状态筛选和搜索。
2. 打开第一条“构建可靠的网址收藏工作流”，展示阅读模式、表格与代码块。
3. 切换到 Markdown 源码，再进入编辑模式，修改备注或增加标签并保存。
4. 返回首页，搜索正文独特词“星图工作流”，确认正文命中摘要出现。
5. 清除搜索，点击“安全”标签，只显示 SSRF 防护示例。
6. 搜索 `security.example`，说明搜索覆盖域名和 URL。
7. 搜索 `observable recovery path`，展示英文正文搜索。
8. 选择“部分提取”，展示已保留可用正文的状态；再选择“提取失败”。
9. 打开失败示例，展示错误原因、网址和备注仍然存在。
10. 打开任意成功记录，展示 `.md` 下载、重新提取和删除二次确认。

## 实时创建（可选）

如需展示“粘贴 URL → 自动提取”的实时过程，使用本地固定 fixture，避免公网波动：

```powershell
$env:ALLOW_TEST_LOOPBACK="1"
npm run dev
```

收藏：

```text
http://127.0.0.1:3000/api/test-fixture/article
```

说明系统正在执行 URL/DNS 安全检查、抓取、Readability、清理和 Markdown 转换。
停止开发服务后执行 `Remove-Item Env:ALLOW_TEST_LOOPBACK`。

## 失败场景

1. 在首页选择“提取失败”，打开“受限页面：登录后内容不可提取”；
2. 展示失败书签仍然保留 URL、错误码、备注和编辑入口；
3. 如需现场验证 SSRF，可输入 `http://127.0.0.1/private`；
4. 展示 `PRIVATE_NETWORK_BLOCKED`，并说明失败记录没有被静默删除。

## 持久化

1. 停止 Node 服务；
2. 重新执行 `npm run dev`；
3. 搜索“离线优先恢复”，展示初始化的书签仍然存在于 `data/bookmarks.db`。

## 收尾

若交付包不需要预置演示数据，执行：

```bash
npm run db:clear:demo
```

该命令只清理演示记录，不会删除普通收藏。需要继续截图或录屏时，再次执行
`npm run db:seed:demo` 即可恢复标准数据集。
