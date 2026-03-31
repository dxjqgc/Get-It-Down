export type TaskStatus = "todo" | "in_progress" | "done";

export interface TaskProperty {
  value: string;
  inheritable: boolean;
}

export type TaskProperties = Record<string, TaskProperty>;

export interface TaskRecord {
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

export interface TaskTreeNode extends TaskRecord {
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

export interface TaskResponse {
  summary: TaskSummary;
  tree: TaskTreeNode[];
}

export interface PropertyItem {
  key: string;
  value: string;
  inheritable: boolean;
}

export interface TaskFormValues {
  parentId?: number;
  title: string;
  description: string;
  status: TaskStatus;
  isImportant: boolean;
  dueDate: string | null;
  customProperties: PropertyItem[];
  inheritedPropertyKeys: string[];
}

export interface TaskFormSubmitValues {
  parentId?: number;
  title: string;
  description: string;
  status: TaskStatus;
  isImportant: boolean;
  dueDate: string | null;
  customProperties: Record<string, TaskProperty>;
  inheritedPropertyKeys: string[];
}

export interface ReorderTaskPayload {
  taskId: number;
  parentId: number | null;
  index: number;
}

export interface TaskArchive {
  version: number;
  exportedAt: string;
  tasks: TaskRecord[];
}
