# 本地运行与数据维护

## 最快启动方式（Windows）

环境要求：Node.js 22 或更高版本、npm 11，以及可访问 npm registry 的网络。

```text
setup.bat
start.bat
```

`setup.bat` 安装锁定依赖并执行数据库迁移；`start.bat` 在缺少生产构建时执行构建，
随后启动 `http://localhost:3000`。命令窗口需要保持打开。

## 便携发布包（Windows x64）

便携包适合交付给不安装开发环境的使用者。维护者执行：

```text
npm run package:portable
```

生成内容：

```text
release/url-bookmark-v1.0.0-win-x64/
release/url-bookmark-v1.0.0-win-x64.zip
release/url-bookmark-v1.0.0-win-x64.zip.sha256
```

ZIP 内含 Node.js、Next.js standalone 生产构建、迁移 SQL 和本地启动器；不含源码
依赖目录、测试工具或开发者真实数据。使用者完整解压后双击 `start.bat`，无需安装
Node.js 或运行 `npm install`。启动器只监听 `127.0.0.1`，默认从 3000—3010 中选择
空闲端口，自动迁移 `data/bookmarks.db` 并打开浏览器。包内还提供 `backup.bat` /
`restore.bat`，用于在应用停止后备份或还原 `data/bookmarks.db` 与 `data/assets/`。

需要固定端口时，在解压目录的命令提示符中运行：

```bat
set PORT=3200
start.bat
```

便携包当前面向 Windows 10/11 x64。源码方式仍支持项目声明的其他 Node.js 平台。

## 手动开发

```bash
npm install --no-audit --no-fund
npm run db:migrate
npm run dev
```

## 手动生产运行

```bash
npm install --no-audit --no-fund
npm run db:migrate
npm run build
npm run start
```

生产服务启动时会自动执行幂等数据库迁移，默认使用 3000 端口。指定其他端口：

```bash
npm run start -- -p 3200
```

启动后访问 `http://localhost:3000/api/health`，返回 `{"status":"ok"}` 表示服务正常。

## 数据位置

默认数据位于：

```text
data/bookmarks.db
data/assets/
```

关闭浏览器不会影响数据；只要继续使用同一个数据目录，关闭并重启 Node 服务后数据
仍然存在。可通过 `.env.local` 中的 `DATABASE_PATH` 使用其他数据库路径。

## 备份

1. 正常停止应用；
2. 复制 `data/bookmarks.db` 和整个 `data/assets/`；
3. 如果数据库仍有 `bookmarks.db-wal`，应先正常停止服务，或把 DB/WAL/SHM 一起备份；
4. 将备份保存在项目目录之外，不要提交到 Git。

## 恢复

1. 停止应用；
2. 把备份的 `bookmarks.db` 和 `assets/` 放回 `data/`；
3. 执行 `npm run db:migrate`；
4. 重新启动并检查列表和本地图片。

## 演示数据

```bash
npm run db:seed:demo
npm run db:clear:demo
```

初始化命令可重复执行，不访问公网；清理命令只删除固定演示记录，不删除普通收藏。

## 常见问题

- **3000 端口被占用**：停止旧实例，或使用 `npm run start -- -p 3200`；
- **依赖目录不完整**：重新执行 `npm install --no-audit --no-fund`；
- **数据库被锁定**：关闭其他项目实例后再迁移、替换或备份数据库；
- **公网文章提取失败**：目标可能有登录、验证码、付费墙、强反爬或纯 JS 渲染；
- **图片仍是远程地址**：图片可能需要鉴权、超过限制或使用了不安全的 SVG；
- **Clash/TUN 环境提示内网地址**：应用会尝试可信 DoH；可信解析失败时不会降低
  SSRF 防护等级。
