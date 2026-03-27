export type TaskStatus = "todo" | "in_progress" | "done";

export type TaskProperties = Record<string, string>;

export interface Task {
  id: number;
  parentId: number | null;
  title: string;
  description: string;
  status: TaskStatus;
  dueDate: string | null;
  completedAt: string | null;
  customProperties: TaskProperties;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface TaskTreeNode extends Task {
  inheritedProperties: TaskProperties;
  effectiveProperties: TaskProperties;
  progress: number;
  children: TaskTreeNode[];
}

export interface TaskSummary {
  total: number;
  roots: number;
  done: number;
  inProgress: number;
  todo: number;
  completionRate: number;
}

export interface TaskInput {
  parentId?: number | null;
  title: string;
  description?: string;
  status?: TaskStatus;
  dueDate?: string | null;
  completedAt?: string | null;
  customProperties?: TaskProperties;
  sortOrder?: number;
}

export interface TaskPatch {
  parentId?: number | null;
  title?: string;
  description?: string;
  status?: TaskStatus;
  dueDate?: string | null;
  completedAt?: string | null;
  customProperties?: TaskProperties;
  sortOrder?: number;
}

export interface ReorderTaskInput {
  taskId: number;
  parentId: number | null;
  index: number;
}
