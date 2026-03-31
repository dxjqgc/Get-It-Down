export type TaskStatus = "todo" | "in_progress" | "done";

export interface TaskProperty {
  value: string;
  inheritable: boolean;
  crossLevelInheritable: boolean;
}

export type TaskProperties = Record<string, TaskProperty>;

export interface Task {
  id: number;
  parentId: number | null;
  title: string;
  description: string;
  status: TaskStatus;
  isImportant: boolean;
  dueDate: string | null;
  completedAt: string | null;
  customProperties: TaskProperties;
  inheritedPropertyKeys: string[];
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
  isImportant?: boolean;
  dueDate?: string | null;
  completedAt?: string | null;
  customProperties?: TaskProperties;
  inheritedPropertyKeys?: string[];
  sortOrder?: number;
}

export interface TaskPatch {
  parentId?: number | null;
  title?: string;
  description?: string;
  status?: TaskStatus;
  isImportant?: boolean;
  dueDate?: string | null;
  completedAt?: string | null;
  customProperties?: TaskProperties;
  inheritedPropertyKeys?: string[];
  sortOrder?: number;
}

export interface ReorderTaskInput {
  taskId: number;
  parentId: number | null;
  index: number;
}

export interface TaskArchive {
  version: 1;
  exportedAt: string;
  tasks: Task[];
}
