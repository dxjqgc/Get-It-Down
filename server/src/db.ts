import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(currentDir, "../data");
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, "get-it-done.db"));
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'todo',
    is_important INTEGER NOT NULL DEFAULT 0,
    due_date TEXT,
    completed_at TEXT,
    custom_properties TEXT NOT NULL DEFAULT '{}',
    inherited_property_keys TEXT NOT NULL DEFAULT '[]',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

const columns = db.prepare("PRAGMA table_info(tasks)").all() as { name: string }[];
const hasImportantColumn = columns.some((column) => column.name === "is_important");
if (!hasImportantColumn) {
  db.exec("ALTER TABLE tasks ADD COLUMN is_important INTEGER NOT NULL DEFAULT 0");
}

const hasInheritedPropertyKeysColumn = columns.some(
  (column) => column.name === "inherited_property_keys"
);
if (!hasInheritedPropertyKeysColumn) {
  db.exec("ALTER TABLE tasks ADD COLUMN inherited_property_keys TEXT NOT NULL DEFAULT '[]'");
}

const row = db.prepare("SELECT COUNT(*) AS count FROM tasks").get() as { count: number };

if (row.count === 0) {
  const now = new Date().toISOString();
  const insert = db.prepare(`
    INSERT INTO tasks (
      parent_id,
      title,
      description,
      status,
      is_important,
      due_date,
      completed_at,
      custom_properties,
      inherited_property_keys,
      sort_order,
      created_at,
      updated_at
    ) VALUES (
      @parent_id,
      @title,
      @description,
      @status,
      @is_important,
      @due_date,
      @completed_at,
      @custom_properties,
      @inherited_property_keys,
      @sort_order,
      @created_at,
      @updated_at
    )
  `);

  const root = insert.run({
    parent_id: null,
    title: "学习英语",
    description: "把英语学习目标拆解成可以执行的具体任务。",
    status: "in_progress",
    is_important: 0,
    due_date: null,
    completed_at: null,
    custom_properties: JSON.stringify({
      学习周期: { value: "90天", inheritable: true },
      每周投入: { value: "6小时", inheritable: true }
    }),
    inherited_property_keys: JSON.stringify([]),
    sort_order: 0,
    created_at: now,
    updated_at: now
  });

  insert.run({
    parent_id: Number(root.lastInsertRowid),
    title: "背单词",
    description: "每天完成词汇积累。",
    status: "todo",
    is_important: 1,
    due_date: null,
    completed_at: null,
    custom_properties: JSON.stringify({
      背诵方式: { value: "Anki", inheritable: false }
    }),
    inherited_property_keys: JSON.stringify(["学习周期"]),
    sort_order: 0,
    created_at: now,
    updated_at: now
  });

  insert.run({
    parent_id: Number(root.lastInsertRowid),
    title: "听英语",
    description: "通过播客和视频提升输入量。",
    status: "todo",
    is_important: 0,
    due_date: null,
    completed_at: null,
    custom_properties: JSON.stringify({
      每日时长: { value: "30分钟", inheritable: false }
    }),
    inherited_property_keys: JSON.stringify(["每周投入"]),
    sort_order: 1,
    created_at: now,
    updated_at: now
  });
}

export default db;
