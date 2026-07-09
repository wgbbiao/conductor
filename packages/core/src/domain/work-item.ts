/**
 * WorkItem —— Conductor 的核心业务对象（一个需求/任务/bug）。
 * bug 不作为独立实体，而是 WorkItem 的一种 type（见 ADR-0003）。
 */

/** WorkItem 的类型：bug/feature/task */
export type WorkItemType = "bug" | "feature" | "task";

/** WorkItem 的生命周期状态 */
export type WorkItemStatus =
  | "draft"
  | "ready" // 就绪，可触发 ToolRun
  | "running" // 有进行中的 ToolRun
  | "review" // 等待人工 Handoff/审批
  | "done"
  | "failed";

export interface WorkItem {
  id: string; // wi_xxx
  projectId: string;
  type: WorkItemType; // bug/feature/task
  title: string;
  description: string;
  status: WorkItemStatus;
  currentToolRunId: string | null;
  createdAt: string;
  updatedAt: string;
}
