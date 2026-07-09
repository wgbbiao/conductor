import type { WorkItemStatus } from "../domain/work-item.js";
import type { ToolInvocation } from "../tools/tool-provider.js";

/**
 * PolicyEngine —— 治理契约（第三个扩展点，但 Role 不与能力插件同类）。
 * Phase 1 仅定义接口，不实现完整 RBAC 矩阵（留 P4）。
 */

export type Permission = string;

export interface PolicyContext {
  userId: string;
  roleIds: string[];
}

export interface PolicyDecision {
  allow: boolean;
  reason?: string;
}

export interface ApprovalRequirement {
  approverRoleIds: string[];
}

/** 治理契约 —— Phase 1 仅定义接口 */
export interface PolicyEngine {
  canTransition(ctx: PolicyContext, from: WorkItemStatus, to: WorkItemStatus): Promise<PolicyDecision>;
  canInvokeTool(ctx: PolicyContext, invocation: ToolInvocation): Promise<PolicyDecision>;
  requiresApproval(ctx: PolicyContext, from: WorkItemStatus, to: WorkItemStatus): Promise<ApprovalRequirement | null>;
}
