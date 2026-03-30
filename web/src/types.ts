export type TaskStatus = "todo" | "in_progress" | "done";

export type TaskProperties = Record<string, string>;

export interface TaskRecord {
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
}

export interface TaskFormValues {
  parentId?: number;
  title: string;
  description: string;
  status: TaskStatus;
  dueDate: string | null;
  customProperties: PropertyItem[];
}

export interface TaskFormSubmitValues {
  parentId?: number;
  title: string;
  description: string;
  status: TaskStatus;
  dueDate: string | null;
  customProperties: Record<string, string>;
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
