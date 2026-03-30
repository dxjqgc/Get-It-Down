import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import dotenv from "dotenv";
import express, { type Request, type Response } from "express";
import {
  createTaskNode,
  deleteTaskNode,
  exportTaskArchive,
  getTaskSummary,
  getTaskTree,
  importTaskArchive,
  reorderTaskNode,
  updateTaskNode
} from "./taskService.js";
import type { ReorderTaskInput, TaskInput, TaskPatch } from "./types.js";

const app = express();
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(currentDir, "../../.env");
const webDist = path.resolve(currentDir, "../../web/dist");

dotenv.config({ path: envPath });

const port = Number(process.env.PORT || 26666);

app.use(cors());
app.use(express.json({ limit: "10mb" }));

app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

app.get("/api/tasks", (_req: Request, res: Response) => {
  res.json({
    summary: getTaskSummary(),
    tree: getTaskTree()
  });
});

app.get("/api/tasks/export", (_req: Request, res: Response) => {
  res.json(exportTaskArchive());
});

app.post("/api/tasks/import", (req: Request, res: Response) => {
  try {
    const result = importTaskArchive(req.body);
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "导入失败";
    res.status(400).json({ message });
  }
});

app.post("/api/tasks", (req: Request<unknown, unknown, Partial<TaskInput>>, res: Response) => {
  try {
    const task = createTaskNode(req.body ?? {});
    res.status(201).json(task);
  } catch (error) {
    const message = error instanceof Error ? error.message : "创建任务失败";
    res.status(400).json({ message });
  }
});

app.put("/api/tasks/:id", (req: Request<{ id: string }, unknown, TaskPatch>, res: Response) => {
  try {
    const task = updateTaskNode(Number(req.params.id), req.body ?? {});
    res.json(task);
  } catch (error) {
    const message = error instanceof Error ? error.message : "更新任务失败";
    res.status(400).json({ message });
  }
});

app.post(
  "/api/tasks/reorder",
  (req: Request<unknown, unknown, ReorderTaskInput>, res: Response) => {
    try {
      const task = reorderTaskNode(req.body);
      res.json(task);
    } catch (error) {
      const message = error instanceof Error ? error.message : "排序失败";
      res.status(400).json({ message });
    }
  }
);

app.delete("/api/tasks/:id", (req: Request<{ id: string }>, res: Response) => {
  try {
    deleteTaskNode(Number(req.params.id));
    res.status(204).send();
  } catch (error) {
    const message = error instanceof Error ? error.message : "删除任务失败";
    res.status(404).json({ message });
  }
});

app.use(express.static(webDist));

app.get("*", (req: Request, res: Response, next) => {
  if (req.path.startsWith("/api/")) {
    next();
    return;
  }
  res.sendFile(path.join(webDist, "index.html"));
});

app.listen(port, () => {
  console.log(`GetItDone server listening on http://localhost:${port}`);
});
