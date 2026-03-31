import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import "dayjs/locale/en";
import "dayjs/locale/zh-cn";
import type { FormListFieldData, TreeDataNode, TreeProps } from "antd";
import {
  App as AntApp,
  Button,
  Card,
  Col,
  Dropdown,
  DatePicker,
  Empty,
  Form,
  Input,
  message,
  Modal,
  Popconfirm,
  Progress,
  Row,
  Select,
  Space,
  Statistic,
  Tag,
  Tree,
  ConfigProvider
} from "antd";
import zhCN from "antd/locale/zh_CN";
import enUS from "antd/locale/en_US";
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  DownOutlined,
  DownloadOutlined,
  DeleteOutlined,
  EditOutlined,
  FlagOutlined,
  PlusOutlined,
  UploadOutlined
} from "@ant-design/icons";
import type {
  PropertyItem,
  ReorderTaskPayload,
  TaskArchive,
  TaskFormSubmitValues,
  TaskFormValues,
  TaskRecord,
  TaskResponse,
  TaskStatus,
  TaskSummary,
  TaskTreeNode
} from "./types";
import { getInitialLocale, persistLocale, translate } from "./i18n";
import type { Locale } from "./i18n";

interface StatusOption {
  value: TaskStatus;
  label: string;
  color: "default" | "processing" | "success";
}

type TranslateFn = (key: string, vars?: Record<string, string | number>) => string;

interface ParentOption {
  value: number;
  label: string;
}

interface TaskModalState {
  open: boolean;
  mode: "create" | "edit";
  task: TaskFormValues & { id?: number } | null;
}

type TaskModalFormValues = Omit<TaskFormValues, "dueDate"> & { dueDate: Dayjs | null };

interface TaskModalProps {
  open: boolean;
  mode: "create" | "edit";
  initialValues: (TaskFormValues & { id?: number }) | null;
  parentOptions: ParentOption[];
  statusOptions: StatusOption[];
  t: TranslateFn;
  onCancel: () => void;
  onSubmit: (values: TaskFormSubmitValues) => Promise<void>;
}

interface ApiError {
  message?: string;
}

interface ImportResponse {
  imported: number;
  mode: "replace" | "append";
}

type ImportMode = "replace" | "append";

function getStatusOptions(t: TranslateFn): StatusOption[] {
  return [
    { value: "todo", label: t("status.todo"), color: "default" },
    { value: "in_progress", label: t("status.inProgress"), color: "processing" },
    { value: "done", label: t("status.done"), color: "success" }
  ];
}

const EMPTY_FORM: TaskFormValues = {
  title: "",
  description: "",
  status: "todo",
  dueDate: null,
  customProperties: []
};

function statusMeta(status: TaskStatus, statusOptions: StatusOption[]): StatusOption {
  return statusOptions.find((item) => item.value === status) ?? statusOptions[0];
}

function flattenTree(tree: TaskTreeNode[], acc: TaskTreeNode[] = []): TaskTreeNode[] {
  tree.forEach((node) => {
    acc.push(node);
    flattenTree(node.children ?? [], acc);
  });
  return acc;
}

function toTreeData(nodes: TaskTreeNode[], statusOptions: StatusOption[]): TreeDataNode[] {
  return nodes.map((node) => ({
    key: String(node.id),
    title: (
      <div className="tree-node">
        <span className="tree-node__title">{node.title}</span>
        <span className="tree-node__meta">
          <Tag color={statusMeta(node.status, statusOptions).color}>
            {statusMeta(node.status, statusOptions).label}
          </Tag>
          <span className="tree-node__progress">{node.progress}%</span>
        </span>
      </div>
    ),
    children: toTreeData(node.children ?? [], statusOptions)
  }));
}

function propertyArrayToObject(items: PropertyItem[]): Record<string, string> {
  return items.reduce<Record<string, string>>((acc, item) => {
    const key = item.key?.trim();
    const value = item.value?.trim();
    if (key && value) {
      acc[key] = value;
    }
    return acc;
  }, {});
}

function mergeInheritedAndCustomProperties(
  inherited: Record<string, string>,
  custom: Record<string, string>
): PropertyItem[] {
  const inheritedKeys = Object.keys(inherited ?? {});
  const inheritedSet = new Set(inheritedKeys);

  const inheritedItems = inheritedKeys.map((key) => ({
    key,
    value: custom?.[key] ?? ""
  }));

  const customOnlyItems = Object.entries(custom ?? {})
    .filter(([key]) => !inheritedSet.has(key))
    .map(([key, value]) => ({ key, value }));

  return [...inheritedItems, ...customOnlyItems];
}

function depthOf(id: number, nodes: TaskTreeNode[], level = 0): number {
  for (const node of nodes) {
    if (node.id === id) {
      return level;
    }
    const nested = depthOf(id, node.children ?? [], level + 1);
    if (nested !== -1) {
      return nested;
    }
  }
  return -1;
}

function findTaskById(nodes: TaskTreeNode[], id: number): TaskTreeNode | null {
  for (const node of nodes) {
    if (node.id === id) {
      return node;
    }
    const nested = findTaskById(node.children ?? [], id);
    if (nested) {
      return nested;
    }
  }
  return null;
}

function isDescendant(parent: TaskTreeNode, childId: number): boolean {
  return parent.children.some((child) => child.id === childId || isDescendant(child, childId));
}

async function request<T>(url: string, fallbackMessage: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json"
    },
    ...options
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => ({ message: fallbackMessage }))) as ApiError;
    throw new Error(data.message || fallbackMessage);
  }

  if (response.status === 204) {
    return null as T;
  }

  return (await response.json()) as T;
}

function exportFileName(): string {
  return `get-it-done-export-${dayjs().format("YYYYMMDD-HHmmss")}.json`;
}

function flattenImportedTreeNodes(input: unknown, acc: unknown[] = []): unknown[] {
  if (!Array.isArray(input)) {
    return acc;
  }

  input.forEach((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return;
    }
    acc.push(item);
    const children = (item as { children?: unknown }).children;
    if (Array.isArray(children)) {
      flattenImportedTreeNodes(children, acc);
    }
  });

  return acc;
}

function normalizeImportArchive(input: unknown): TaskArchive {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("error.invalidImportShape");
  }

  const obj = input as Record<string, unknown>;
  const now = new Date().toISOString();
  const version = typeof obj.version === "number" ? obj.version : 1;
  const exportedAt = typeof obj.exportedAt === "string" ? obj.exportedAt : now;

  if (Array.isArray(obj.tasks)) {
    return { version, exportedAt, tasks: obj.tasks as TaskRecord[] };
  }

  const data = obj.data;
  if (
    data &&
    typeof data === "object" &&
    !Array.isArray(data) &&
    Array.isArray((data as { tasks?: unknown }).tasks)
  ) {
    const dataObj = data as Record<string, unknown>;
    return {
      version: typeof dataObj.version === "number" ? dataObj.version : version,
      exportedAt: typeof dataObj.exportedAt === "string" ? dataObj.exportedAt : exportedAt,
      tasks: dataObj.tasks as TaskRecord[]
    };
  }

  if (Array.isArray(obj.tree)) {
    const tasks = flattenImportedTreeNodes(obj.tree) as TaskRecord[];
    return {
      version,
      exportedAt,
      tasks
    };
  }

  throw new Error("error.invalidImportShape");
}

function TaskModal({
  open,
  mode,
  initialValues,
  parentOptions,
  statusOptions,
  t,
  onCancel,
  onSubmit
}: TaskModalProps) {
  const [form] = Form.useForm<TaskModalFormValues>();

  useEffect(() => {
    form.setFieldsValue({
      ...EMPTY_FORM,
      ...initialValues,
      dueDate: initialValues?.dueDate ? dayjs(initialValues.dueDate) : null,
      customProperties: initialValues?.customProperties || EMPTY_FORM.customProperties
    });
  }, [form, initialValues]);

  return (
    <Modal
      open={open}
      title={mode === "create" ? t("modal.createTitle") : t("modal.editTitle")}
      onCancel={onCancel}
      onOk={() => form.submit()}
      okText={mode === "create" ? t("modal.create") : t("modal.save")}
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={(values) =>
          onSubmit({
            parentId: values.parentId,
            title: values.title,
            description: values.description,
            status: values.status,
            dueDate: values.dueDate ? values.dueDate.toISOString() : null,
            customProperties: propertyArrayToObject(values.customProperties || [])
          })
        }
      >
        <Form.Item
          name="title"
          label={t("form.title")}
          rules={[{ required: true, message: t("form.titleRequired") }]}
        >
          <Input placeholder={t("form.titlePlaceholder")} />
        </Form.Item>
        <Form.Item name="parentId" label={t("form.parentTask")}>
          <Select allowClear placeholder={t("form.parentTaskPlaceholder")} options={parentOptions} />
        </Form.Item>
        <Form.Item name="status" label={t("form.status")}>
          <Select options={statusOptions.map(({ value, label }) => ({ value, label }))} />
        </Form.Item>
        <Form.Item name="dueDate" label={t("form.dueDate")}>
          <DatePicker showTime style={{ width: "100%" }} />
        </Form.Item>
        <Form.Item name="description" label={t("form.description")}>
          <Input.TextArea rows={4} placeholder={t("form.descriptionPlaceholder")} />
        </Form.Item>
        <Form.List name="customProperties">
          {(fields, { add, remove }) => (
            <div className="property-editor">
              <div className="property-editor__header">
                <span>{t("form.customProperties")}</span>
                <Button size="small" onClick={() => add({ key: "", value: "" })}>
                  {t("form.addProperty")}
                </Button>
              </div>
              {fields.map((field: FormListFieldData) => (
                <Space key={field.key} className="property-row" align="baseline">
                  <Form.Item
                    {...field}
                    name={[field.name, "key"]}
                    rules={[{ required: true, message: t("form.propertyNameRequired") }]}
                  >
                    <Input placeholder={t("form.propertyName")} />
                  </Form.Item>
                  <Form.Item
                    {...field}
                    name={[field.name, "value"]}
                  >
                    <Input placeholder={t("form.propertyValue")} />
                  </Form.Item>
                  <Button danger onClick={() => remove(field.name)}>
                    {t("common.delete")}
                  </Button>
                </Space>
              ))}
            </div>
          )}
        </Form.List>
      </Form>
    </Modal>
  );
}

export default function App() {
  const [messageApi, contextHolder] = message.useMessage();
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const importModeRef = useRef<ImportMode>("replace");
  const [locale, setLocale] = useState<Locale>(() => getInitialLocale());
  const [tree, setTree] = useState<TaskTreeNode[]>([]);
  const [summary, setSummary] = useState<TaskSummary | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalState, setModalState] = useState<TaskModalState>({
    open: false,
    mode: "create",
    task: null
  });
  const t = useMemo<TranslateFn>(
    () => (key, vars) => translate(locale, key, vars),
    [locale]
  );
  const statusOptions = useMemo(() => getStatusOptions(t), [t]);

  useEffect(() => {
    persistLocale(locale);
    dayjs.locale(locale === "zh-CN" ? "zh-cn" : "en");
  }, [locale]);

  const loadData = async (): Promise<void> => {
    setLoading(true);
    try {
      const data = await request<TaskResponse>("/api/tasks", t("request.failed"));
      setTree(data.tree);
      setSummary(data.summary);

      const flat = flattenTree(data.tree, []);
      if (!selectedId && flat[0]) {
        setSelectedId(flat[0].id);
      } else if (selectedId && !flat.some((item) => item.id === selectedId)) {
        setSelectedId(flat[0]?.id ?? null);
      }
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : t("request.loadFailed"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [locale]);

  const handleExport = async (): Promise<void> => {
    try {
      const archive = await request<TaskArchive>("/api/tasks/export", t("request.exportFailed"));
      const blob = new Blob([JSON.stringify(archive, null, 2)], {
        type: "application/json;charset=utf-8"
      });
      const url = window.URL.createObjectURL(blob);
      const link = window.document.createElement("a");
      link.href = url;
      link.download = exportFileName();
      link.click();
      window.URL.revokeObjectURL(url);
      messageApi.success(t("success.exported"));
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : t("request.exportFailed"));
    }
  };

  const handleImportClick = (): void => {
    importInputRef.current?.click();
  };

  const handleImportAction = (mode: ImportMode): void => {
    importModeRef.current = mode;
    handleImportClick();
  };

  const handleImportFileChange = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const normalizedText =
        text.charCodeAt(0) === 0xfeff
          ? text.slice(1)
          : text;
      const parsed = JSON.parse(normalizedText) as unknown;
      const normalized = normalizeImportArchive(parsed);
      const mode = importModeRef.current;
      const confirmed = window.confirm(
        mode === "append"
          ? `${t("hero.importAppendConfirmTitle")}\n\n${t("hero.importAppendConfirmDescription")}`
          : `${t("hero.importConfirmTitle")}\n\n${t("hero.importConfirmDescription")}`
      );
      if (!confirmed) {
        return;
      }

      const result = await request<ImportResponse>(`/api/tasks/import?mode=${mode}`, t("request.importFailed"), {
        method: "POST",
        body: JSON.stringify(normalized)
      });
      const successMessage =
        result.mode === "append"
          ? t("success.importedAppend", { count: result.imported })
          : t("success.imported", { count: result.imported });
      messageApi.success(successMessage);
      window.alert(successMessage);
      await loadData();
    } catch (error) {
      if (error instanceof SyntaxError) {
        const text = t("error.invalidImportFile");
        messageApi.error(text);
        window.alert(text);
        return;
      }
      if (error instanceof Error && error.message === "error.invalidImportShape") {
        const text = t("error.invalidImportShape");
        messageApi.error(text);
        window.alert(text);
        return;
      }
      const text = error instanceof Error ? error.message : t("error.readImportFailed");
      messageApi.error(text);
      window.alert(text);
    }
  };

  const flatTasks = useMemo(() => flattenTree(tree, []), [tree]);
  const selectedTask = flatTasks.find((item) => item.id === selectedId) ?? null;

  const parentOptions: ParentOption[] = flatTasks
    .filter((item) => item.id !== modalState.task?.id)
    .map((item) => ({
      value: item.id,
      label: `${"· ".repeat(depthOf(item.id, tree))}${item.title}`
    }));

  const openCreateModal = (parentId: number | null = selectedTask?.id ?? null): void => {
    const parentTask = parentId == null ? null : flatTasks.find((item) => item.id === parentId) ?? null;
    setModalState({
      open: true,
      mode: "create",
      task: {
        ...EMPTY_FORM,
        parentId: parentId ?? undefined,
        customProperties: mergeInheritedAndCustomProperties(parentTask?.effectiveProperties ?? {}, {})
      }
    });
  };

  const openEditModal = (): void => {
    if (!selectedTask) {
      return;
    }

    setModalState({
      open: true,
      mode: "edit",
      task: {
        id: selectedTask.id,
        parentId: selectedTask.parentId ?? undefined,
        title: selectedTask.title,
        description: selectedTask.description,
        status: selectedTask.status,
        dueDate: selectedTask.dueDate,
        customProperties: mergeInheritedAndCustomProperties(
          selectedTask.inheritedProperties ?? {},
          selectedTask.customProperties ?? {}
        )
      }
    });
  };

  const handleSubmit = async (values: TaskFormSubmitValues): Promise<void> => {
    try {
      if (modalState.mode === "create") {
        await request("/api/tasks", t("request.failed"), {
          method: "POST",
          body: JSON.stringify(values)
        });
        messageApi.success(t("success.created"));
      } else if (modalState.task?.id) {
        await request(`/api/tasks/${modalState.task.id}`, t("request.failed"), {
          method: "PUT",
          body: JSON.stringify(values)
        });
        messageApi.success(t("success.updated"));
      }

      setModalState({ open: false, mode: "create", task: null });
      await loadData();
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : t("request.saveFailed"));
    }
  };

  const handleDelete = async (): Promise<void> => {
    if (!selectedTask) {
      return;
    }

    try {
      await request<null>(`/api/tasks/${selectedTask.id}`, t("request.failed"), { method: "DELETE" });
      messageApi.success(t("success.deleted"));
      await loadData();
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : t("request.deleteFailed"));
    }
  };

  const handleQuickStatus = async (status: TaskStatus): Promise<void> => {
    if (!selectedTask) {
      return;
    }

    try {
      await request(`/api/tasks/${selectedTask.id}`, t("request.failed"), {
        method: "PUT",
        body: JSON.stringify({ status })
      });
      messageApi.success(t("success.statusUpdated"));
      await loadData();
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : t("request.updateFailed"));
    }
  };

  const handleDrop: TreeProps["onDrop"] = async (info) => {
    const dragId = Number(info.dragNode.key);
    const targetId = Number(info.node.key);

    const dragTask = findTaskById(tree, dragId);
    const targetTask = findTaskById(tree, targetId);

    if (!dragTask || !targetTask) {
      messageApi.error(t("error.invalidDropTarget"));
      return;
    }

    if (dragId === targetId || isDescendant(dragTask, targetId)) {
      messageApi.error(t("error.cannotDropToDescendant"));
      return;
    }

    let payload: ReorderTaskPayload;

    if (info.dropToGap) {
      const siblingParentId = targetTask.parentId;
      const siblings = flatTasks
        .filter((item) => item.parentId === siblingParentId && item.id !== dragId)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
      const targetIndex = siblings.findIndex((item) => item.id === targetId);
      const insertIndex = info.dropPosition < 0 ? targetIndex : targetIndex + 1;

      payload = {
        taskId: dragId,
        parentId: siblingParentId,
        index: Math.max(0, insertIndex)
      };
    } else {
      payload = {
        taskId: dragId,
        parentId: targetTask.id,
        index: targetTask.children.length
      };
    }

    try {
      await request("/api/tasks/reorder", t("request.failed"), {
        method: "POST",
        body: JSON.stringify(payload)
      });
      messageApi.success(t("success.reorderUpdated"));
      await loadData();
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : t("request.reorderFailed"));
    }
  };

  return (
    <ConfigProvider
      locale={locale === "zh-CN" ? zhCN : enUS}
      theme={{
        token: {
          colorPrimary: "#1f6f78",
          borderRadius: 18,
          colorBgLayout: "#f4efe6",
          fontFamily: "'Avenir Next', 'PingFang SC', 'Hiragino Sans GB', sans-serif"
        }
      }}
    >
      <AntApp>
        {contextHolder}
        <div className="page-shell">
        <section className="hero">
          <div>
            <span className="hero__eyebrow">{t("hero.eyebrow")}</span>
            <h1>{t("hero.title")}</h1>
            <p>
              {t("hero.subtitle")}
            </p>
          </div>
          <Space>
            <Select
              value={locale}
              onChange={(value) => setLocale(value)}
              options={[
                { value: "zh-CN", label: t("language.zhCN") },
                { value: "en-US", label: t("language.enUS") }
              ]}
            />
            <Button size="large" icon={<DownloadOutlined />} onClick={() => void handleExport()}>
              {t("hero.exportJson")}
            </Button>
            <Dropdown
              trigger={["click"]}
              menu={{
                items: [
                  { key: "replace", label: t("hero.importModeReplace") },
                  { key: "append", label: t("hero.importModeAppend") }
                ],
                onClick: ({ key }) => handleImportAction(key as ImportMode)
              }}
            >
              <Button size="large" icon={<UploadOutlined />}>
                {t("hero.importJson")} <DownOutlined />
              </Button>
            </Dropdown>
            <Button type="primary" size="large" icon={<PlusOutlined />} onClick={() => openCreateModal(null)}>
              {t("hero.createGoal")}
            </Button>
            <Button size="large" onClick={() => openCreateModal()}>
              {t("hero.createSubtask")}
            </Button>
          </Space>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden-file-input"
            onChange={(event) => void handleImportFileChange(event)}
          />
        </section>

        <Row gutter={[20, 20]} className="stats-row">
          <Col xs={12} md={6}>
            <Card><Statistic title={t("stats.total")} value={summary?.total ?? 0} /></Card>
          </Col>
          <Col xs={12} md={6}>
            <Card><Statistic title={t("stats.roots")} value={summary?.roots ?? 0} prefix={<FlagOutlined />} /></Card>
          </Col>
          <Col xs={12} md={6}>
            <Card><Statistic title={t("stats.inProgress")} value={summary?.inProgress ?? 0} prefix={<ClockCircleOutlined />} /></Card>
          </Col>
          <Col xs={12} md={6}>
            <Card><Statistic title={t("stats.completionRate")} value={summary?.completionRate ?? 0} suffix="%" prefix={<CheckCircleOutlined />} /></Card>
          </Col>
        </Row>

        <Row gutter={[20, 20]}>
          <Col xs={24} lg={9}>
            <Card
              className="glass-card"
              title={t("tree.title")}
              extra={<Button type="link" onClick={() => openCreateModal()}>{t("tree.add")}</Button>}
              loading={loading}
            >
              {tree.length > 0 ? (
                <Tree
                  draggable
                  selectedKeys={selectedId ? [String(selectedId)] : []}
                  treeData={toTreeData(tree, statusOptions)}
                  defaultExpandAll
                  onDrop={(info) => void handleDrop(info)}
                  onSelect={(keys) => {
                    const first = keys[0];
                    setSelectedId(first ? Number(first) : null);
                  }}
                />
              ) : (
                <Empty description={t("tree.empty")} />
              )}
            </Card>
          </Col>
          <Col xs={24} lg={15}>
            <Card className="glass-card" loading={loading}>
              {selectedTask ? (
                <div className="detail-pane">
                  <div className="detail-pane__header">
                    <div>
                      <Tag color={statusMeta(selectedTask.status, statusOptions).color}>
                        {statusMeta(selectedTask.status, statusOptions).label}
                      </Tag>
                      <h2>{selectedTask.title}</h2>
                      <p>{selectedTask.description || t("detail.noDescription")}</p>
                    </div>
                    <Space wrap>
                      <Button icon={<PlusOutlined />} onClick={() => openCreateModal(selectedTask.id)}>
                        {t("detail.splitSubtask")}
                      </Button>
                      <Button icon={<EditOutlined />} onClick={openEditModal}>
                        {t("detail.edit")}
                      </Button>
                      <Popconfirm
                        title={t("detail.deleteConfirm")}
                        onConfirm={() => void handleDelete()}
                      >
                        <Button danger icon={<DeleteOutlined />}>
                          {t("common.delete")}
                        </Button>
                      </Popconfirm>
                    </Space>
                  </div>

                  <div className="quick-actions">
                    <Button onClick={() => void handleQuickStatus("todo")}>{t("quick.markTodo")}</Button>
                    <Button onClick={() => void handleQuickStatus("in_progress")}>{t("quick.markInProgress")}</Button>
                    <Button type="primary" onClick={() => void handleQuickStatus("done")}>{t("quick.markDone")}</Button>
                  </div>

                  <Card className="inner-card">
                    <div className="progress-block">
                      <div>
                        <span className="section-label">{t("detail.progress")}</span>
                        <h3>{selectedTask.progress}%</h3>
                      </div>
                      <Progress percent={selectedTask.progress} strokeColor="#1f6f78" />
                    </div>
                  </Card>

                  <Row gutter={[16, 16]}>
                    <Col xs={24} md={12}>
                      <Card className="inner-card" title={t("detail.timeInfo")}>
                        <p>
                          {t("detail.dueDate", {
                            value: selectedTask.dueDate
                              ? dayjs(selectedTask.dueDate).format("YYYY-MM-DD HH:mm")
                              : t("detail.notSet")
                          })}
                        </p>
                        <p>
                          {t("detail.completedAt", {
                            value: selectedTask.completedAt
                              ? dayjs(selectedTask.completedAt).format("YYYY-MM-DD HH:mm")
                              : t("detail.notDone")
                          })}
                        </p>
                      </Card>
                    </Col>
                    <Col xs={24} md={12}>
                      <Card className="inner-card" title={t("detail.propertyInheritance")}>
                        <div className="property-list">
                          {Object.keys(selectedTask.effectiveProperties || {}).length > 0 ? (
                            Object.entries(selectedTask.effectiveProperties).map(([key, value]) => (
                              <div className="property-chip" key={key}>
                                <span>{key}</span>
                                <strong>{value}</strong>
                              </div>
                            ))
                          ) : (
                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("detail.noProperties")} />
                          )}
                        </div>
                      </Card>
                    </Col>
                  </Row>

                  <Card className="inner-card" title={t("detail.inheritanceSummary")}>
                    <p>{t("detail.inheritedCount", { value: Object.keys(selectedTask.inheritedProperties || {}).length })}</p>
                    <p>{t("detail.customCount", { value: Object.keys(selectedTask.customProperties || {}).length })}</p>
                    <p>{t("detail.childrenCount", { value: selectedTask.children?.length ?? 0 })}</p>
                  </Card>
                </div>
              ) : (
                <Empty description={t("detail.empty")} />
              )}
            </Card>
          </Col>
        </Row>
        </div>

        <TaskModal
          open={modalState.open}
          mode={modalState.mode}
          initialValues={modalState.task}
          parentOptions={parentOptions}
          statusOptions={statusOptions}
          t={t}
          onCancel={() => setModalState({ open: false, mode: "create", task: null })}
          onSubmit={handleSubmit}
        />
      </AntApp>
    </ConfigProvider>
  );
}
