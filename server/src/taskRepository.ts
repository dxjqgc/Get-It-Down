import type { RunResult } from "better-sqlite3";
import db from "./db.js";
import type { Task, TaskInput, TaskPatch } from "./types.js";

interface TaskRow {
  id: number;
  parent_id: number | null;
  title: string;
  description: string;
  status: Task["status"];
  due_date: string | null;
  completed_at: string | null;
  custom_properties: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

function parseTask(row: TaskRow): Task {
  return {
    id: row.id,
    parentId: row.parent_id,
    title: row.title,
    description: row.description,
    status: row.status,
    dueDate: row.due_date,
    completedAt: row.completed_at,
    customProperties: JSON.parse(row.custom_properties || "{}") as Task["customProperties"],
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function listTasks(): Task[] {
  const rows = db
    .prepare("SELECT * FROM tasks ORDER BY parent_id IS NOT NULL, parent_id, sort_order, id")
    .all() as TaskRow[];
  return rows.map(parseTask);
}

export function listTasksByParent(parentId: number | null): Task[] {
  const rows = db
    .prepare(`
      SELECT *
      FROM tasks
      WHERE parent_id IS ?
      ORDER BY sort_order, id
    `)
    .all(parentId) as TaskRow[];

  return rows.map(parseTask);
}

export function getTask(id: number): Task | null {
  const row = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as TaskRow | undefined;
  return row ? parseTask(row) : null;
}

export function createTask(input: TaskInput): Task {
  const now = new Date().toISOString();
  const result = db
    .prepare(`
      INSERT INTO tasks (
        parent_id,
        title,
        description,
        status,
        due_date,
        completed_at,
        custom_properties,
        sort_order,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      input.parentId ?? null,
      input.title,
      input.description ?? "",
      input.status ?? "todo",
      input.dueDate ?? null,
      input.completedAt ?? null,
      JSON.stringify(input.customProperties ?? {}),
      input.sortOrder ?? 0,
      now,
      now
    ) as RunResult;

  return getTask(Number(result.lastInsertRowid)) as Task;
}

export function updateTask(id: number, patch: TaskPatch): Task | null {
  const existing = getTask(id);
  if (!existing) {
    return null;
  }

  const next: Task = {
    ...existing,
    ...patch,
    customProperties: patch.customProperties ?? existing.customProperties
  };

  db.prepare(`
    UPDATE tasks
    SET parent_id = ?,
        title = ?,
        description = ?,
        status = ?,
        due_date = ?,
        completed_at = ?,
        custom_properties = ?,
        sort_order = ?,
        updated_at = ?
    WHERE id = ?
  `).run(
    next.parentId ?? null,
    next.title,
    next.description ?? "",
    next.status,
    next.dueDate ?? null,
    next.completedAt ?? null,
    JSON.stringify(next.customProperties ?? {}),
    next.sortOrder ?? 0,
    new Date().toISOString(),
    id
  );

  return getTask(id);
}

export function deleteTask(id: number): RunResult {
  return db.prepare("DELETE FROM tasks WHERE id = ?").run(id) as RunResult;
}

interface TaskMoveUpdate {
  id: number;
  parentId: number | null;
  sortOrder: number;
}

export function applyTaskMove(updates: TaskMoveUpdate[]): void {
  const statement = db.prepare(`
    UPDATE tasks
    SET parent_id = ?,
        sort_order = ?,
        updated_at = ?
    WHERE id = ?
  `);

  const transaction = db.transaction((entries: TaskMoveUpdate[]) => {
    const now = new Date().toISOString();
    entries.forEach((entry) => {
      statement.run(entry.parentId, entry.sortOrder, now, entry.id);
    });
  });

  transaction(updates);
}
