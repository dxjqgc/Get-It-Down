import {
  applyTaskMove,
  createTask,
  deleteTask,
  getTask,
  listTasks,
  listTasksByParent,
  replaceAllTasks,
  updateTask
} from "./taskRepository.js";
import type {
  ReorderTaskInput,
  Task,
  TaskArchive,
  TaskInput,
  TaskPatch,
  TaskProperties,
  TaskStatus,
  TaskSummary,
  TaskTreeNode
} from "./types.js";

const VALID_STATUSES = new Set<TaskStatus>(["todo", "in_progress", "done"]);
const ARCHIVE_VERSION = 1;
type ImportMode = "replace" | "append";

interface TaskImportPayload {
  id: unknown;
  parentId?: unknown;
  title?: unknown;
  description?: unknown;
  status?: unknown;
  isImportant?: unknown;
  dueDate?: unknown;
  completedAt?: unknown;
  customProperties?: unknown;
  sortOrder?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}

interface TaskArchiveImportPayload {
  version?: unknown;
  exportedAt?: unknown;
  tasks?: unknown;
}

function assertValidParent(parentId: number | null | undefined): void {
  if (parentId != null && !getTask(parentId)) {
    throw new Error("父任务不存在");
  }
}

function assertNoCircularReference(taskId: number, nextParentId: number | null): void {
  if (nextParentId == null) {
    return;
  }

  if (taskId === nextParentId) {
    throw new Error("任务不能把自己设为父任务");
  }

  const tasks = listTasks();
  const childrenByParent = new Map<number | null, Task[]>();

  tasks.forEach((task) => {
    const siblings = childrenByParent.get(task.parentId) ?? [];
    siblings.push(task);
    childrenByParent.set(task.parentId, siblings);
  });

  const stack = [...(childrenByParent.get(taskId) ?? [])];
  while (stack.length > 0) {
    const current = stack.pop() as Task;
    if (current.id === nextParentId) {
      throw new Error("不能拖动到自己的子任务下面");
    }
    stack.push(...(childrenByParent.get(current.id) ?? []));
  }
}

function nextSortOrder(parentId: number | null): number {
  const siblings = listTasksByParent(parentId);
  if (siblings.length === 0) {
    return 0;
  }
  return Math.max(...siblings.map((item) => item.sortOrder)) + 1;
}

function sanitizeProperties(input: unknown): TaskProperties {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(input)
      .map(([key, value]) => [String(key).trim(), String(value ?? "").trim()])
      .filter(([key]) => key)
  );
}

function normalizeDateTime(value: unknown, fieldName: string): string | null {
  if (value == null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new Error(`${fieldName} 必须是字符串或 null`);
  }
  const text = value.trim();
  if (!text) {
    return null;
  }
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName} 不是合法时间`);
  }
  return date.toISOString();
}

function normalizeTaskForImport(payload: unknown): Task {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("tasks 数组中的每一项都必须是对象");
  }

  const raw = payload as TaskImportPayload;

  if (!Number.isInteger(raw.id) || Number(raw.id) <= 0) {
    throw new Error("任务 id 必须是大于 0 的整数");
  }

  if (typeof raw.title !== "string" || !raw.title.trim()) {
    throw new Error(`任务 ${raw.id} 的标题不能为空`);
  }

  const statusRaw = raw.status ?? "todo";
  if (typeof statusRaw !== "string" || !VALID_STATUSES.has(statusRaw as TaskStatus)) {
    throw new Error(`任务 ${raw.id} 的状态不合法`);
  }
  const status = statusRaw as TaskStatus;

  const dueDate = normalizeDateTime(raw.dueDate, `任务 ${raw.id} 的 dueDate`);
  const completedAt =
    status === "done"
      ? normalizeDateTime(raw.completedAt, `任务 ${raw.id} 的 completedAt`) ?? new Date().toISOString()
      : null;
  const isImportant =
    raw.isImportant === undefined ? false : Boolean(raw.isImportant);

  let parentId: number | null = null;
  if (raw.parentId !== null && raw.parentId !== undefined) {
    if (typeof raw.parentId !== "number" || !Number.isInteger(raw.parentId) || raw.parentId <= 0) {
      throw new Error(`任务 ${raw.id} 的 parentId 必须是整数或 null`);
    }
    parentId = raw.parentId;
  }

  const sortOrder =
    typeof raw.sortOrder === "number" && Number.isInteger(raw.sortOrder) && raw.sortOrder >= 0
      ? raw.sortOrder
      : 0;

  const now = new Date().toISOString();

  return {
    id: Number(raw.id),
    parentId,
    title: raw.title.trim(),
    description: typeof raw.description === "string" ? raw.description.trim() : "",
    status,
    isImportant,
    dueDate,
    completedAt,
    customProperties: sanitizeProperties(raw.customProperties),
    sortOrder,
    createdAt: normalizeDateTime(raw.createdAt, `任务 ${raw.id} 的 createdAt`) ?? now,
    updatedAt: normalizeDateTime(raw.updatedAt, `任务 ${raw.id} 的 updatedAt`) ?? now
  };
}

function validateTaskGraph(tasks: Task[]): void {
  const byId = new Map<number, Task>();
  tasks.forEach((task) => {
    if (byId.has(task.id)) {
      throw new Error(`任务 id 重复: ${task.id}`);
    }
    byId.set(task.id, task);
  });

  tasks.forEach((task) => {
    if (task.parentId == null) {
      return;
    }
    if (!byId.has(task.parentId)) {
      throw new Error(`任务 ${task.id} 的父任务 ${task.parentId} 不存在`);
    }
    if (task.parentId === task.id) {
      throw new Error(`任务 ${task.id} 不能把自己设为父任务`);
    }
  });

  const childrenByParent = new Map<number, number[]>();
  tasks.forEach((task) => {
    if (task.parentId == null) {
      return;
    }
    const children = childrenByParent.get(task.parentId) ?? [];
    children.push(task.id);
    childrenByParent.set(task.parentId, children);
  });

  const visited = new Set<number>();
  const visiting = new Set<number>();

  const walk = (taskId: number): void => {
    if (visiting.has(taskId)) {
      throw new Error("导入数据存在循环父子关系");
    }
    if (visited.has(taskId)) {
      return;
    }
    visiting.add(taskId);
    (childrenByParent.get(taskId) ?? []).forEach((childId) => walk(childId));
    visiting.delete(taskId);
    visited.add(taskId);
  };

  tasks.forEach((task) => walk(task.id));
}

function normalizeImportMode(mode: unknown): ImportMode {
  if (mode === undefined || mode === null || mode === "replace" || mode === "overwrite") {
    return "replace";
  }
  if (mode === "append") {
    return "append";
  }
  throw new Error("导入模式不合法，仅支持 replace/overwrite/append");
}

function remapTasksForAppend(existingTasks: Task[], importedTasks: Task[]): Task[] {
  if (importedTasks.length === 0) {
    return [];
  }

  let nextId = existingTasks.reduce((max, task) => Math.max(max, task.id), 0) + 1;
  const idMap = new Map<number, number>();
  importedTasks.forEach((task) => {
    idMap.set(task.id, nextId);
    nextId += 1;
  });

  const nextSortOrderByParent = new Map<number | null, number>();
  existingTasks.forEach((task) => {
    const current = nextSortOrderByParent.get(task.parentId) ?? 0;
    nextSortOrderByParent.set(task.parentId, Math.max(current, task.sortOrder + 1));
  });

  const sortedImported = [...importedTasks].sort((a, b) => {
    const parentA = a.parentId ?? -1;
    const parentB = b.parentId ?? -1;
    if (parentA !== parentB) {
      return parentA - parentB;
    }
    if (a.sortOrder !== b.sortOrder) {
      return a.sortOrder - b.sortOrder;
    }
    return a.id - b.id;
  });

  return sortedImported.map((task) => {
    const mappedParentId =
      task.parentId == null
        ? null
        : idMap.get(task.parentId) ?? task.parentId;
    const nextSortOrder = nextSortOrderByParent.get(mappedParentId) ?? 0;
    nextSortOrderByParent.set(mappedParentId, nextSortOrder + 1);

    return {
      ...task,
      id: idMap.get(task.id) as number,
      parentId: mappedParentId,
      sortOrder: nextSortOrder
    };
  });
}

function buildTree(tasks: Task[]): TaskTreeNode[] {
  const byId = new Map<number, TaskTreeNode>();

  tasks.forEach((task) => {
    byId.set(task.id, {
      ...task,
      inheritedProperties: {},
      effectiveProperties: { ...task.customProperties },
      progress: 0,
      children: []
    });
  });

  const roots: TaskTreeNode[] = [];

  byId.forEach((task) => {
    if (task.parentId && byId.has(task.parentId)) {
      byId.get(task.parentId)?.children.push(task);
    } else {
      roots.push(task);
    }
  });

  const sortChildren = (node: TaskTreeNode): void => {
    node.children.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
    node.children.forEach(sortChildren);
  };
  roots.forEach(sortChildren);

  const inheritedKeysOnly = (properties: TaskProperties): TaskProperties =>
    Object.fromEntries(Object.keys(properties).map((key) => [key, ""]));

  const decorate = (
    node: TaskTreeNode,
    parentProperties: TaskProperties = {}
  ): TaskTreeNode => {
    node.inheritedProperties = inheritedKeysOnly(parentProperties);
    node.effectiveProperties = {
      ...node.inheritedProperties,
      ...node.customProperties
    };

    node.children.forEach((child) => decorate(child, node.effectiveProperties));

    if (node.children.length === 0) {
      node.progress = node.status === "done" ? 100 : 0;
      return node;
    }

    const total = node.children.reduce((sum, child) => sum + child.progress, 0);
    node.progress = Math.round(total / node.children.length);
    return node;
  };

  return roots.map((root) => decorate(root));
}

export function getTaskTree(): TaskTreeNode[] {
  return buildTree(listTasks());
}

export function getTaskSummary(): TaskSummary {
  const tasks = listTasks();
  const total = tasks.length;
  const done = tasks.filter((task) => task.status === "done").length;
  const inProgress = tasks.filter((task) => task.status === "in_progress").length;
  const todo = tasks.filter((task) => task.status === "todo").length;
  const roots = tasks.filter((task) => task.parentId === null).length;

  return {
    total,
    roots,
    done,
    inProgress,
    todo,
    completionRate: total === 0 ? 0 : Math.round((done / total) * 100)
  };
}

export function createTaskNode(payload: Partial<TaskInput>): Task {
  if (!payload.title?.trim()) {
    throw new Error("任务标题不能为空");
  }

  assertValidParent(payload.parentId);

  if (payload.status && !VALID_STATUSES.has(payload.status)) {
    throw new Error("任务状态不合法");
  }

  const completedAt =
    payload.status === "done"
      ? payload.completedAt || new Date().toISOString()
      : null;

  return createTask({
    parentId: payload.parentId ?? null,
    title: payload.title.trim(),
    description: payload.description?.trim() ?? "",
    status: payload.status ?? "todo",
    isImportant: payload.isImportant === true,
    dueDate: payload.dueDate ?? null,
    completedAt,
    customProperties: sanitizeProperties(payload.customProperties),
    sortOrder:
      typeof payload.sortOrder === "number" &&
      Number.isInteger(payload.sortOrder) &&
      payload.sortOrder >= 0
        ? payload.sortOrder
        : nextSortOrder(payload.parentId ?? null)
  });
}

export function updateTaskNode(id: number, payload: TaskPatch): Task | null {
  const existing = getTask(id);
  if (!existing) {
    throw new Error("任务不存在");
  }

  assertValidParent(payload.parentId);
  assertNoCircularReference(id, payload.parentId ?? existing.parentId);

  if (payload.status && !VALID_STATUSES.has(payload.status)) {
    throw new Error("任务状态不合法");
  }

  const nextStatus = payload.status ?? existing.status;

  return updateTask(id, {
    parentId:
      payload.parentId === undefined ? existing.parentId : payload.parentId,
    title: payload.title?.trim() ?? existing.title,
    description:
      payload.description === undefined
        ? existing.description
        : payload.description.trim(),
    status: nextStatus,
    isImportant:
      payload.isImportant === undefined
        ? existing.isImportant
        : payload.isImportant,
    dueDate: payload.dueDate === undefined ? existing.dueDate : payload.dueDate,
    completedAt:
      nextStatus === "done"
        ? payload.completedAt || existing.completedAt || new Date().toISOString()
        : null,
    customProperties:
      payload.customProperties === undefined
        ? existing.customProperties
        : sanitizeProperties(payload.customProperties),
    sortOrder:
      payload.sortOrder === undefined
        ? existing.sortOrder
        : Math.max(0, payload.sortOrder)
  });
}

export function reorderTaskNode(payload: ReorderTaskInput): Task {
  const task = getTask(payload.taskId);
  if (!task) {
    throw new Error("任务不存在");
  }

  assertValidParent(payload.parentId);
  assertNoCircularReference(task.id, payload.parentId);

  const sourceParentId = task.parentId;
  const targetParentId = payload.parentId;
  const targetSiblings = listTasksByParent(targetParentId).filter((item) => item.id !== task.id);
  const sourceSiblings =
    sourceParentId === targetParentId
      ? targetSiblings
      : listTasksByParent(sourceParentId).filter((item) => item.id !== task.id);

  const normalizedIndex = Math.max(0, Math.min(payload.index, targetSiblings.length));
  targetSiblings.splice(normalizedIndex, 0, {
    ...task,
    parentId: targetParentId
  });

  const updates = [
    ...sourceSiblings.map((item, index) => ({
      id: item.id,
      parentId: sourceParentId,
      sortOrder: index
    })),
    ...targetSiblings.map((item, index) => ({
      id: item.id,
      parentId: targetParentId,
      sortOrder: index
    }))
  ].filter(
    (entry, index, array) =>
      array.findIndex((candidate) => candidate.id === entry.id) === index
  );

  applyTaskMove(updates);

  return getTask(task.id) as Task;
}

export function deleteTaskNode(id: number): void {
  if (!getTask(id)) {
    throw new Error("任务不存在");
  }

  deleteTask(id);
}

export function exportTaskArchive(): TaskArchive {
  return {
    version: ARCHIVE_VERSION,
    exportedAt: new Date().toISOString(),
    tasks: listTasks()
  };
}

export function importTaskArchive(
  payload: unknown,
  modeInput?: unknown
): { imported: number; mode: ImportMode } {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("导入内容必须是 JSON 对象");
  }

  const archive = payload as TaskArchiveImportPayload;
  if (!Array.isArray(archive.tasks)) {
    throw new Error("导入内容缺少 tasks 数组");
  }

  if (archive.version !== undefined && archive.version !== ARCHIVE_VERSION) {
    throw new Error(`暂不支持版本 ${String(archive.version)} 的导入文件`);
  }

  const importedTasks = archive.tasks.map((rawTask) => normalizeTaskForImport(rawTask));
  validateTaskGraph(importedTasks);

  const mode = normalizeImportMode(modeInput);
  if (mode === "replace") {
    replaceAllTasks(importedTasks);
    return { imported: importedTasks.length, mode };
  }

  const existingTasks = listTasks();
  const appendedTasks = remapTasksForAppend(existingTasks, importedTasks);
  const mergedTasks = [...existingTasks, ...appendedTasks];
  validateTaskGraph(mergedTasks);
  replaceAllTasks(mergedTasks);

  return { imported: appendedTasks.length, mode };
}
