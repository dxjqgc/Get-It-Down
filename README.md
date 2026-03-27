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

- `PORT`：后端服务端口，默认 `3001`

### 3. 启动后端

```bash
npm run dev:server
```

后端通过 `tsx` 直接运行 TypeScript 源码，默认地址：`http://localhost:3001`

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

应用会通过 `http://localhost:3001` 对外提供服务，后端同时托管前端构建产物。
