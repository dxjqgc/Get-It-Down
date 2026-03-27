import { useEffect, useMemo, useState } from "react";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import type { FormListFieldData, TreeDataNode, TreeProps } from "antd";
import {
  App as AntApp,
  Button,
  Card,
  Col,
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
  Tree
} from "antd";
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  FlagOutlined,
  PlusOutlined
} from "@ant-design/icons";
import type {
  PropertyItem,
  ReorderTaskPayload,
  TaskFormSubmitValues,
  TaskFormValues,
  TaskResponse,
  TaskStatus,
  TaskSummary,
  TaskTreeNode
} from "./types";

interface StatusOption {
  value: TaskStatus;
  label: string;
  color: "default" | "processing" | "success";
}

interface ParentOption {
  value: number;
  label: string;
}

interface TaskModalState {
  open: boolean;
  mode: "create" | "edit";
  task: TaskFormValues & { id?: number } | null;
}

interface TaskModalProps {
  open: boolean;
  mode: "create" | "edit";
  initialValues: (TaskFormValues & { id?: number }) | null;
  parentOptions: ParentOption[];
  onCancel: () => void;
  onSubmit: (values: TaskFormSubmitValues) => Promise<void>;
}

interface ApiError {
  message?: string;
}

const STATUS_OPTIONS: StatusOption[] = [
  { value: "todo", label: "未开始", color: "default" },
  { value: "in_progress", label: "进行中", color: "processing" },
  { value: "done", label: "已完成", color: "success" }
];

const EMPTY_FORM: TaskFormValues = {
  title: "",
  description: "",
  status: "todo",
  dueDate: null,
  customProperties: [{ key: "", value: "" }]
};

function statusMeta(status: TaskStatus): StatusOption {
  return STATUS_OPTIONS.find((item) => item.value === status) ?? STATUS_OPTIONS[0];
}

function flattenTree(tree: TaskTreeNode[], acc: TaskTreeNode[] = []): TaskTreeNode[] {
  tree.forEach((node) => {
    acc.push(node);
    flattenTree(node.children ?? [], acc);
  });
  return acc;
}

function toTreeData(nodes: TaskTreeNode[]): TreeDataNode[] {
  return nodes.map((node) => ({
    key: String(node.id),
    title: (
      <div className="tree-node">
        <span className="tree-node__title">{node.title}</span>
        <span className="tree-node__meta">
          <Tag color={statusMeta(node.status).color}>{statusMeta(node.status).label}</Tag>
          <span className="tree-node__progress">{node.progress}%</span>
        </span>
      </div>
    ),
    children: toTreeData(node.children ?? [])
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

function objectToPropertyArray(object: Record<string, string>): PropertyItem[] {
  const entries = Object.entries(object ?? {});
  return entries.length > 0
    ? entries.map(([key, value]) => ({ key, value }))
    : [{ key: "", value: "" }];
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

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json"
    },
    ...options
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => ({ message: "请求失败" }))) as ApiError;
    throw new Error(data.message || "请求失败");
  }

  if (response.status === 204) {
    return null as T;
  }

  return (await response.json()) as T;
}

function TaskModal({
  open,
  mode,
  initialValues,
  parentOptions,
  onCancel,
  onSubmit
}: TaskModalProps) {
  const [form] = Form.useForm<TaskFormValues & { dueDate: Dayjs | null }>();

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
      title={mode === "create" ? "新建任务" : "编辑任务"}
      onCancel={onCancel}
      onOk={() => form.submit()}
      okText={mode === "create" ? "创建" : "保存"}
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
          label="标题"
          rules={[{ required: true, message: "请输入任务标题" }]}
        >
          <Input placeholder="例如：背单词" />
        </Form.Item>
        <Form.Item name="parentId" label="父任务">
          <Select allowClear placeholder="不选则为顶级目标" options={parentOptions} />
        </Form.Item>
        <Form.Item name="status" label="状态">
          <Select options={STATUS_OPTIONS.map(({ value, label }) => ({ value, label }))} />
        </Form.Item>
        <Form.Item name="dueDate" label="截止时间">
          <DatePicker showTime style={{ width: "100%" }} />
        </Form.Item>
        <Form.Item name="description" label="说明">
          <Input.TextArea rows={4} placeholder="补充这个任务的执行方式或备注" />
        </Form.Item>
        <Form.List name="customProperties">
          {(fields, { add, remove }) => (
            <div className="property-editor">
              <div className="property-editor__header">
                <span>自定义属性</span>
                <Button size="small" onClick={() => add({ key: "", value: "" })}>
                  添加属性
                </Button>
              </div>
              {fields.map((field: FormListFieldData) => (
                <Space key={field.key} className="property-row" align="baseline">
                  <Form.Item
                    {...field}
                    name={[field.name, "key"]}
                    rules={[{ required: true, message: "属性名不能为空" }]}
                  >
                    <Input placeholder="属性名" />
                  </Form.Item>
                  <Form.Item
                    {...field}
                    name={[field.name, "value"]}
                    rules={[{ required: true, message: "属性值不能为空" }]}
                  >
                    <Input placeholder="属性值" />
                  </Form.Item>
                  <Button danger onClick={() => remove(field.name)}>
                    删除
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
  const [tree, setTree] = useState<TaskTreeNode[]>([]);
  const [summary, setSummary] = useState<TaskSummary | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalState, setModalState] = useState<TaskModalState>({
    open: false,
    mode: "create",
    task: null
  });

  const loadData = async (): Promise<void> => {
    setLoading(true);
    try {
      const data = await request<TaskResponse>("/api/tasks");
      setTree(data.tree);
      setSummary(data.summary);

      const flat = flattenTree(data.tree, []);
      if (!selectedId && flat[0]) {
        setSelectedId(flat[0].id);
      } else if (selectedId && !flat.some((item) => item.id === selectedId)) {
        setSelectedId(flat[0]?.id ?? null);
      }
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const flatTasks = useMemo(() => flattenTree(tree, []), [tree]);
  const selectedTask = flatTasks.find((item) => item.id === selectedId) ?? null;

  const parentOptions: ParentOption[] = flatTasks
    .filter((item) => item.id !== modalState.task?.id)
    .map((item) => ({
      value: item.id,
      label: `${"· ".repeat(depthOf(item.id, tree))}${item.title}`
    }));

  const openCreateModal = (parentId: number | null = selectedTask?.id ?? null): void => {
    setModalState({
      open: true,
      mode: "create",
      task: {
        ...EMPTY_FORM,
        parentId: parentId ?? undefined,
        customProperties: [{ key: "", value: "" }]
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
        customProperties: objectToPropertyArray(selectedTask.customProperties)
      }
    });
  };

  const handleSubmit = async (values: TaskFormSubmitValues): Promise<void> => {
    try {
      if (modalState.mode === "create") {
        await request("/api/tasks", {
          method: "POST",
          body: JSON.stringify(values)
        });
        messageApi.success("任务已创建");
      } else if (modalState.task?.id) {
        await request(`/api/tasks/${modalState.task.id}`, {
          method: "PUT",
          body: JSON.stringify(values)
        });
        messageApi.success("任务已更新");
      }

      setModalState({ open: false, mode: "create", task: null });
      await loadData();
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "保存失败");
    }
  };

  const handleDelete = async (): Promise<void> => {
    if (!selectedTask) {
      return;
    }

    try {
      await request<null>(`/api/tasks/${selectedTask.id}`, { method: "DELETE" });
      messageApi.success("任务已删除");
      await loadData();
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "删除失败");
    }
  };

  const handleQuickStatus = async (status: TaskStatus): Promise<void> => {
    if (!selectedTask) {
      return;
    }

    try {
      await request(`/api/tasks/${selectedTask.id}`, {
        method: "PUT",
        body: JSON.stringify({ status })
      });
      messageApi.success("状态已更新");
      await loadData();
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "更新失败");
    }
  };

  const handleDrop: TreeProps["onDrop"] = async (info) => {
    const dragId = Number(info.dragNode.key);
    const targetId = Number(info.node.key);

    const dragTask = findTaskById(tree, dragId);
    const targetTask = findTaskById(tree, targetId);

    if (!dragTask || !targetTask) {
      messageApi.error("拖拽目标无效");
      return;
    }

    if (dragId === targetId || isDescendant(dragTask, targetId)) {
      messageApi.error("不能拖动到自己的子任务层级");
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
      await request("/api/tasks/reorder", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      messageApi.success("排序已更新");
      await loadData();
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "拖拽排序失败");
    }
  };

  return (
    <AntApp>
      {contextHolder}
      <div className="page-shell">
        <section className="hero">
          <div>
            <span className="hero__eyebrow">Personal Goal Decomposition</span>
            <h1>把大目标拆到今天就能开始做</h1>
            <p>
              GetItDone 帮你把目标、子任务、属性和完成进度放进同一棵树里，随时继续拆分，直到每一步都足够清晰。
            </p>
          </div>
          <Space>
            <Button type="primary" size="large" icon={<PlusOutlined />} onClick={() => openCreateModal(null)}>
              新建目标
            </Button>
            <Button size="large" onClick={() => openCreateModal()}>
              新建子任务
            </Button>
          </Space>
        </section>

        <Row gutter={[20, 20]} className="stats-row">
          <Col xs={12} md={6}>
            <Card><Statistic title="总任务数" value={summary?.total ?? 0} /></Card>
          </Col>
          <Col xs={12} md={6}>
            <Card><Statistic title="目标数" value={summary?.roots ?? 0} prefix={<FlagOutlined />} /></Card>
          </Col>
          <Col xs={12} md={6}>
            <Card><Statistic title="进行中" value={summary?.inProgress ?? 0} prefix={<ClockCircleOutlined />} /></Card>
          </Col>
          <Col xs={12} md={6}>
            <Card><Statistic title="完成率" value={summary?.completionRate ?? 0} suffix="%" prefix={<CheckCircleOutlined />} /></Card>
          </Col>
        </Row>

        <Row gutter={[20, 20]}>
          <Col xs={24} lg={9}>
            <Card
              className="glass-card"
              title="任务拆解树"
              extra={<Button type="link" onClick={() => openCreateModal()}>添加</Button>}
              loading={loading}
            >
              {tree.length > 0 ? (
                <Tree
                  draggable
                  selectedKeys={selectedId ? [String(selectedId)] : []}
                  treeData={toTreeData(tree)}
                  defaultExpandAll
                  onDrop={(info) => void handleDrop(info)}
                  onSelect={(keys) => {
                    const first = keys[0];
                    setSelectedId(first ? Number(first) : null);
                  }}
                />
              ) : (
                <Empty description="还没有任何任务" />
              )}
            </Card>
          </Col>
          <Col xs={24} lg={15}>
            <Card className="glass-card" loading={loading}>
              {selectedTask ? (
                <div className="detail-pane">
                  <div className="detail-pane__header">
                    <div>
                      <Tag color={statusMeta(selectedTask.status).color}>
                        {statusMeta(selectedTask.status).label}
                      </Tag>
                      <h2>{selectedTask.title}</h2>
                      <p>{selectedTask.description || "这个任务还没有补充说明。"}</p>
                    </div>
                    <Space wrap>
                      <Button icon={<PlusOutlined />} onClick={() => openCreateModal(selectedTask.id)}>
                        拆分子任务
                      </Button>
                      <Button icon={<EditOutlined />} onClick={openEditModal}>
                        编辑
                      </Button>
                      <Popconfirm
                        title="删除后会一并删除全部子任务，是否继续？"
                        onConfirm={() => void handleDelete()}
                      >
                        <Button danger icon={<DeleteOutlined />}>
                          删除
                        </Button>
                      </Popconfirm>
                    </Space>
                  </div>

                  <div className="quick-actions">
                    <Button onClick={() => void handleQuickStatus("todo")}>标记未开始</Button>
                    <Button onClick={() => void handleQuickStatus("in_progress")}>标记进行中</Button>
                    <Button type="primary" onClick={() => void handleQuickStatus("done")}>标记完成</Button>
                  </div>

                  <Card className="inner-card">
                    <div className="progress-block">
                      <div>
                        <span className="section-label">拆解进度</span>
                        <h3>{selectedTask.progress}%</h3>
                      </div>
                      <Progress percent={selectedTask.progress} strokeColor="#1f6f78" />
                    </div>
                  </Card>

                  <Row gutter={[16, 16]}>
                    <Col xs={24} md={12}>
                      <Card className="inner-card" title="时间信息">
                        <p>截止时间：{selectedTask.dueDate ? dayjs(selectedTask.dueDate).format("YYYY-MM-DD HH:mm") : "未设置"}</p>
                        <p>完成时间：{selectedTask.completedAt ? dayjs(selectedTask.completedAt).format("YYYY-MM-DD HH:mm") : "未完成"}</p>
                      </Card>
                    </Col>
                    <Col xs={24} md={12}>
                      <Card className="inner-card" title="属性继承">
                        <div className="property-list">
                          {Object.keys(selectedTask.effectiveProperties || {}).length > 0 ? (
                            Object.entries(selectedTask.effectiveProperties).map(([key, value]) => (
                              <div className="property-chip" key={key}>
                                <span>{key}</span>
                                <strong>{value}</strong>
                              </div>
                            ))
                          ) : (
                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无属性" />
                          )}
                        </div>
                      </Card>
                    </Col>
                  </Row>

                  <Card className="inner-card" title="继承关系说明">
                    <p>继承属性：{Object.keys(selectedTask.inheritedProperties || {}).length}</p>
                    <p>自定义属性：{Object.keys(selectedTask.customProperties || {}).length}</p>
                    <p>子任务数量：{selectedTask.children?.length ?? 0}</p>
                  </Card>
                </div>
              ) : (
                <Empty description="从左侧选择一个任务查看详情" />
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
        onCancel={() => setModalState({ open: false, mode: "create", task: null })}
        onSubmit={handleSubmit}
      />
    </AntApp>
  );
}
