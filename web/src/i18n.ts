export type Locale = "zh-CN" | "en-US";

type TranslateVars = Record<string, string | number>;

const DEFAULT_LOCALE: Locale = "zh-CN";
const LOCALE_STORAGE_KEY = "get-it-done.locale";

const messages: Record<Locale, Record<string, string>> = {
  "zh-CN": {
    "request.failed": "请求失败",
    "request.loadFailed": "加载失败",
    "request.saveFailed": "保存失败",
    "request.deleteFailed": "删除失败",
    "request.updateFailed": "更新失败",
    "request.reorderFailed": "拖拽排序失败",
    "request.exportFailed": "导出失败",
    "request.importFailed": "导入失败",
    "success.created": "任务已创建",
    "success.updated": "任务已更新",
    "success.deleted": "任务已删除",
    "success.statusUpdated": "状态已更新",
    "success.reorderUpdated": "排序已更新",
    "success.exported": "已导出 JSON 文件",
    "success.imported": "导入成功，共 {count} 条任务",
    "error.invalidDropTarget": "拖拽目标无效",
    "error.cannotDropToDescendant": "不能拖动到自己的子任务层级",
    "error.invalidImportFile": "导入文件不是合法 JSON",
    "error.invalidImportShape": "导入文件格式错误，缺少 tasks 数组",
    "error.readImportFailed": "读取导入文件失败",
    "status.todo": "未开始",
    "status.inProgress": "进行中",
    "status.done": "已完成",
    "modal.createTitle": "新建任务",
    "modal.editTitle": "编辑任务",
    "modal.create": "创建",
    "modal.save": "保存",
    "form.title": "标题",
    "form.titleRequired": "请输入任务标题",
    "form.titlePlaceholder": "例如：背单词",
    "form.parentTask": "父任务",
    "form.parentTaskPlaceholder": "不选则为顶级目标",
    "form.status": "状态",
    "form.dueDate": "截止时间",
    "form.description": "说明",
    "form.descriptionPlaceholder": "补充这个任务的执行方式或备注",
    "form.customProperties": "自定义属性",
    "form.addProperty": "添加属性",
    "form.propertyNameRequired": "属性名不能为空",
    "form.propertyName": "属性名",
    "form.propertyValueRequired": "属性值不能为空",
    "form.propertyValue": "属性值",
    "common.delete": "删除",
    "hero.eyebrow": "Personal Goal Decomposition",
    "hero.title": "把大目标拆到今天就能开始做",
    "hero.subtitle":
      "GetItDone 帮你把目标、子任务、属性和完成进度放进同一棵树里，随时继续拆分，直到每一步都足够清晰。",
    "hero.createGoal": "新建目标",
    "hero.createSubtask": "新建子任务",
    "hero.exportJson": "导出 JSON",
    "hero.importJson": "导入 JSON",
    "hero.importConfirmTitle": "确认导入并覆盖当前数据？",
    "hero.importConfirmDescription": "导入会清空当前所有任务，再写入文件中的任务数据。",
    "language.label": "语言",
    "language.zhCN": "简体中文",
    "language.enUS": "English",
    "stats.total": "总任务数",
    "stats.roots": "目标数",
    "stats.inProgress": "进行中",
    "stats.completionRate": "完成率",
    "tree.title": "任务拆解树",
    "tree.add": "添加",
    "tree.empty": "还没有任何任务",
    "detail.empty": "从左侧选择一个任务查看详情",
    "detail.noDescription": "这个任务还没有补充说明。",
    "detail.splitSubtask": "拆分子任务",
    "detail.edit": "编辑",
    "detail.deleteConfirm": "删除后会一并删除全部子任务，是否继续？",
    "quick.markTodo": "标记未开始",
    "quick.markInProgress": "标记进行中",
    "quick.markDone": "标记完成",
    "detail.progress": "拆解进度",
    "detail.timeInfo": "时间信息",
    "detail.dueDate": "截止时间：{value}",
    "detail.completedAt": "完成时间：{value}",
    "detail.notSet": "未设置",
    "detail.notDone": "未完成",
    "detail.propertyInheritance": "属性继承",
    "detail.noProperties": "暂无属性",
    "detail.inheritanceSummary": "继承关系说明",
    "detail.inheritedCount": "继承属性：{value}",
    "detail.customCount": "自定义属性：{value}",
    "detail.childrenCount": "子任务数量：{value}"
  },
  "en-US": {
    "request.failed": "Request failed",
    "request.loadFailed": "Failed to load",
    "request.saveFailed": "Failed to save",
    "request.deleteFailed": "Failed to delete",
    "request.updateFailed": "Failed to update",
    "request.reorderFailed": "Failed to reorder tasks",
    "request.exportFailed": "Failed to export",
    "request.importFailed": "Failed to import",
    "success.created": "Task created",
    "success.updated": "Task updated",
    "success.deleted": "Task deleted",
    "success.statusUpdated": "Status updated",
    "success.reorderUpdated": "Task order updated",
    "success.exported": "JSON exported",
    "success.imported": "Import succeeded with {count} tasks",
    "error.invalidDropTarget": "Invalid drop target",
    "error.cannotDropToDescendant": "Cannot move a task under its own descendant",
    "error.invalidImportFile": "The import file is not valid JSON",
    "error.invalidImportShape": "Invalid import format: missing tasks array",
    "error.readImportFailed": "Failed to read import file",
    "status.todo": "To do",
    "status.inProgress": "In progress",
    "status.done": "Done",
    "modal.createTitle": "Create Task",
    "modal.editTitle": "Edit Task",
    "modal.create": "Create",
    "modal.save": "Save",
    "form.title": "Title",
    "form.titleRequired": "Please enter a task title",
    "form.titlePlaceholder": "e.g. Memorize vocabulary",
    "form.parentTask": "Parent task",
    "form.parentTaskPlaceholder": "Leave empty to create a root goal",
    "form.status": "Status",
    "form.dueDate": "Due date",
    "form.description": "Description",
    "form.descriptionPlaceholder": "Add execution notes or extra details",
    "form.customProperties": "Custom properties",
    "form.addProperty": "Add property",
    "form.propertyNameRequired": "Property name is required",
    "form.propertyName": "Property name",
    "form.propertyValueRequired": "Property value is required",
    "form.propertyValue": "Property value",
    "common.delete": "Delete",
    "hero.eyebrow": "Personal Goal Decomposition",
    "hero.title": "Break big goals into actions you can start today",
    "hero.subtitle":
      "GetItDone keeps goals, subtasks, properties, and progress in one tree so you can keep breaking things down until every step is clear.",
    "hero.createGoal": "Create goal",
    "hero.createSubtask": "Create subtask",
    "hero.exportJson": "Export JSON",
    "hero.importJson": "Import JSON",
    "hero.importConfirmTitle": "Import and overwrite current data?",
    "hero.importConfirmDescription": "Import will remove all current tasks and replace them with tasks from the file.",
    "language.label": "Language",
    "language.zhCN": "简体中文",
    "language.enUS": "English",
    "stats.total": "Total tasks",
    "stats.roots": "Goals",
    "stats.inProgress": "In progress",
    "stats.completionRate": "Completion",
    "tree.title": "Task breakdown tree",
    "tree.add": "Add",
    "tree.empty": "No tasks yet",
    "detail.empty": "Select a task from the left to view details",
    "detail.noDescription": "No description has been added yet.",
    "detail.splitSubtask": "Split into subtasks",
    "detail.edit": "Edit",
    "detail.deleteConfirm": "This will delete the task and all subtasks. Continue?",
    "quick.markTodo": "Mark as to do",
    "quick.markInProgress": "Mark as in progress",
    "quick.markDone": "Mark as done",
    "detail.progress": "Breakdown progress",
    "detail.timeInfo": "Time",
    "detail.dueDate": "Due: {value}",
    "detail.completedAt": "Completed: {value}",
    "detail.notSet": "Not set",
    "detail.notDone": "Not completed",
    "detail.propertyInheritance": "Property inheritance",
    "detail.noProperties": "No properties",
    "detail.inheritanceSummary": "Inheritance summary",
    "detail.inheritedCount": "Inherited properties: {value}",
    "detail.customCount": "Custom properties: {value}",
    "detail.childrenCount": "Subtasks: {value}"
  }
};

export function translate(locale: Locale, key: string, vars?: TranslateVars): string {
  const template = messages[locale][key] ?? messages[DEFAULT_LOCALE][key] ?? key;
  if (!vars) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (_, variable: string) => {
    const value = vars[variable];
    return value === undefined ? `{${variable}}` : String(value);
  });
}

export function getInitialLocale(): Locale {
  if (typeof window === "undefined") {
    return DEFAULT_LOCALE;
  }
  const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  if (stored === "zh-CN" || stored === "en-US") {
    return stored;
  }
  return DEFAULT_LOCALE;
}

export function persistLocale(locale: Locale): void {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  }
}
