import type { WorkItemStatus } from "./work-item.js";

/**
 * 流程定义与执行实例分离（见 phase-01-architecture §4）：
 * - WorkflowDefinition：合法的状态转移规则
 * - WorkflowRun：一次执行实例（Phase 1 与 WorkItem 1:1，保留概念分离以便后续分支/重跑）
 */

/** 流程定义：合法的状态转移（Phase 1 内置一份默认） */
export interface WorkflowDefinition {
  id: string;
  name: string;
  transitions: WorkflowTransition[];
}

export interface WorkflowTransition {
  from: WorkItemStatus;
  to: WorkItemStatus;
  /** 是否需要人工审批才能完成此次转移 */
  requiresApproval: boolean;
}

/** 一次执行实例 */
export interface WorkflowRun {
  id: string;
  workItemId: string;
  workflowDefinitionId: string;
  currentStatus: WorkItemStatus;
  createdAt: string;
}
