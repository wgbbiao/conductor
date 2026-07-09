import type { ToolEvent } from "./tool-event";
import type { ToolError } from "../domain/tool-run";

/**
 * ToolProvider —— Conductor 的核心能力扩展点之一（可插拔的 AI 工具适配器）。
 * 实现方提供：能力声明、入参校验、流式执行（返回 AsyncIterable<ToolEvent>）、可选取消。
 */

export interface ToolCapabilities {
  streaming: boolean;
  cancelable: boolean;
  /** 声明支持的命令/能力（用于 allowlist） */
  capabilities: string[];
}

export interface ToolInvocation {
  workItemId: string;
  toolRunId: string;
  prompt: string;
  workspacePath: string;
  timeoutMs?: number;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}

export interface ToolExecutionContext {
  /** 请求取消时调用 */
  signal: AbortSignal;
  logger?: { info: (m: string) => void; error: (m: string, e?: unknown) => void };
}

export type ValidationResult =
  | { valid: true }
  | { valid: false; error: ToolError };

/** AI 工具适配契约 */
export interface ToolProvider {
  readonly id: string;
  readonly displayName: string;
  capabilities(): Promise<ToolCapabilities>;
  validate(input: ToolInvocation): Promise<ValidationResult>;
  execute(input: ToolInvocation, ctx: ToolExecutionContext): AsyncIterable<ToolEvent>;
  cancel?(runId: string, reason?: string): Promise<void>;
}
