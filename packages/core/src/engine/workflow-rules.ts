import type { WorkflowDefinition, WorkflowTransition } from "../domain/workflow";
import type { WorkItemStatus } from "../domain/work-item";

/**
 * 默认流程定义（Phase 1 内置）。
 * 转移规则是纯函数，放 core 零 IO 可单测；状态机的"执行"（事务写入）在 apps/api/engine。
 */
export const defaultWorkflowDefinition: WorkflowDefinition = {
  id: "wf_default",
  name: "default",
  transitions: [
    { from: "draft", to: "ready", requiresApproval: false },
    { from: "ready", to: "running", requiresApproval: false },
    { from: "running", to: "review", requiresApproval: true },
    { from: "running", to: "failed", requiresApproval: false },
    { from: "running", to: "done", requiresApproval: false },
    { from: "review", to: "done", requiresApproval: false },
    { from: "review", to: "running", requiresApproval: false },
    { from: "failed", to: "ready", requiresApproval: false },
  ],
};

/** 查找某条转移规则 */
export function findTransition(
  def: WorkflowDefinition,
  from: WorkItemStatus,
  to: WorkItemStatus,
): WorkflowTransition | undefined {
  return def.transitions.find((t) => t.from === from && t.to === to);
}

/** 该转移是否合法 */
export function canTransition(
  def: WorkflowDefinition,
  from: WorkItemStatus,
  to: WorkItemStatus,
): boolean {
  return findTransition(def, from, to) !== undefined;
}

/** 从某状态可达的全部目标状态 */
export function nextStatuses(def: WorkflowDefinition, from: WorkItemStatus): WorkItemStatus[] {
  return def.transitions.filter((t) => t.from === from).map((t) => t.to);
}
