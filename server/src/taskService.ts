import {
  applyTaskMove,
  createTask,
  deleteTask,
  getTask,
  listTasks,
  listTasksByParent,
  updateTask
} from "./taskRepository.js";
import type {
  ReorderTaskInput,
  Task,
  TaskInput,
  TaskPatch,
  TaskProperties,
  TaskStatus,
  TaskSummary,
  TaskTreeNode
} from "./types.js";

const VALID_STATUSES = new Set<TaskStatus>(["todo", "in_progress", "done"]);

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
      .filter(([key, value]) => key && value)
  );
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

  const decorate = (
    node: TaskTreeNode,
    parentProperties: TaskProperties = {}
  ): TaskTreeNode => {
    node.inheritedProperties = parentProperties;
    node.effectiveProperties = {
      ...parentProperties,
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
