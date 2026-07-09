/**
 * ToolRun —— 一次 AI 工具调用的完整生命周期记录。
 * 幂等由 (workItemId, idempotencyKey) 唯一约束保证。
 */

export type ToolRunStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "canceled";

/** 工具执行错误，带可重试标记 */
export interface ToolError {
  code: string;
  message: string;
  /** 是否可重试 */
  retryable: boolean;
}

export interface ToolRun {
  id: string; // tr_xxx
  workItemId: string;
  providerId: string; // 如 "mock" / "codex"
  status: ToolRunStatus;
  idempotencyKey: string;
  prompt: string;
  exitCode: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}
