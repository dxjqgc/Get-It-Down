# GetItDone

GetItDone 是一个面向个人使用的目标拆解工具。你可以创建目标、拆分子任务、定义任务属性，并通过树状结构持续细化任务直到可以执行。

## 技术栈

- 前端：React + TypeScript + Vite + Ant Design
- 后端：Node.js + TypeScript + Express
- 数据库：SQLite
- 部署：Docker

## 功能概览

- 目标和子任务的树状管理
- 任务新增、编辑、删除
- 状态、截止时间、完成时间管理
- 自定义属性
- 属性继承预览
- 任务完成进度统计

## 本地开发

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

先复制示例文件：

```bash
cp .env.example .env
```

默认会显式读取项目根目录 `.env`，不是 `server/.env`。当前可配置：

- `PORT`：后端服务端口，默认 `26666`

### 3. 启动后端

```bash
npm run dev:server
```

后端通过 `tsx` 直接运行 TypeScript 源码，默认地址：`http://localhost:26666`

### 4. 启动前端

```bash
npm run dev:web
```

默认地址：`http://localhost:5173`

### 5. 生产构建

```bash
npm run build
```

该命令会同时编译后端 TypeScript 和前端静态资源。

## Docker

```bash
docker compose up --build
```

应用会通过 `http://localhost:26666` 对外提供服务，后端同时托管前端构建产物。

## Windows 桌面版（WebView2）

项目已提供 `Web + WebView2` 桌面壳，位于 `desktop-webview2/`。

### 快速启动

```bash
npm install
npm run build
npm run desktop:run
```

如果当前 PowerShell 路径是 `\\?\D:\...` 这种形式（Windows 会把 `npm.cmd` 的工作目录切到 `C:\Windows`），请改用：

```bash
npm --prefix D:\Project\CursorPro\Get-It-Down run desktop:run
```

桌面壳会自动：

- 读取根目录 `.env` 的 `PORT`
- 探测后端是否已运行
- 必要时拉起 `server/dist/index.js`
- 在 WebView2 中加载页面

### 便携包（免安装 Node）

```bash
npm run desktop:portable
```

输出目录：`desktop-webview2/dist/GetItDownDesktop`

便携打包下载 Node 运行时时，会自动优先尝试国内镜像并带重试。
便携包为 `self-contained` 版本（目标机器无需安装 .NET 运行时）。

详细说明见：`desktop-webview2/README.md`。
