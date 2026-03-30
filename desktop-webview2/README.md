# GetItDone WebView2 Desktop

这个目录是 GetItDone 的 Windows 桌面壳版本：

- 界面继续复用现有 Web 前端（`web/dist`）
- 启动时自动探活本地后端
- 若后端未启动，则自动拉起 Node 服务（`server/dist/index.js`）
- 退出桌面应用时自动结束由桌面壳拉起的后端进程

## 运行前准备

1. 安装 Node.js（确保 `node` 命令可用）
2. 安装 .NET SDK（建议 7.0+）
3. 在仓库根目录构建前后端：

```bash
npm install
npm run build
```

## 运行桌面版

在仓库根目录执行：

```bash
npm run desktop:run
```

如果当前 PowerShell 目录显示为 `\\?\D:\...`，请使用：

```bash
npm --prefix D:\Project\CursorPro\Get-It-Down run desktop:run
```

默认会读取项目根目录 `.env` 中的 `PORT`，例如 `PORT=26666`。

## 发布桌面版

```bash
npm run desktop:publish
```

该命令产出 `net48` 版本，不打包 .NET 运行时（目标机器需具备 .NET Framework 4.8）。
该命令产出 `self-contained` 版本（`win-x64`），目标机器无需安装 .NET 运行时。

输出目录位于：

`desktop-webview2/GetItDown.Desktop/bin/Release/net7.0-windows/win-x64/publish`

## 便携版打包（免安装 Node）

如果希望分发给不安装 Node 的用户，执行：

```bash
npm run desktop:portable
```

该脚本会在 `desktop-webview2/dist/GetItDownDesktop` 输出便携目录，并自动：

- 发布 WPF + WebView2 桌面壳
- 复制 `server/dist`、`web/dist`、`.env`（如果存在）
- 安装后端最小运行依赖（仅 `server/package.json` 的 `dependencies`）
- 下载并打包便携 Node 运行时到 `runtime/node`

默认会按镜像优先级下载 Node：

1. `https://npmmirror.com/mirrors/node`
2. `https://mirrors.aliyun.com/nodejs-release`
3. `https://mirrors.cloud.tencent.com/nodejs-release`
4. `https://nodejs.org/dist`

可通过环境变量覆盖镜像列表（逗号或分号分隔）：

```bash
set NODE_DOWNLOAD_BASES=https://npmmirror.com/mirrors/node;https://nodejs.org/dist
npm run desktop:portable
```

最终可直接运行：

`desktop-webview2/dist/GetItDownDesktop/GetItDown.Desktop.exe`

该便携包同样是 `net48` 无运行时版本（目标机器需具备 .NET Framework 4.8）。
该便携包同样是 `self-contained`，目标机器无需安装 .NET 运行时。

## 常见问题

- 提示缺少构建产物：先执行 `npm run build`
- 提示无法启动 Node：确认 Node 已安装并在 PATH
- 打开白屏：检查后端端口是否被占用、以及 `.env` 中 `PORT` 配置是否正确
