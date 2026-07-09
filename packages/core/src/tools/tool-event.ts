import type { ToolError } from "../domain/tool-run.js";

/**
 * ToolEvent —— ToolRun 的流式事件账本（一等模型）。
 * 单 run 内 seq 从 0 单调递增，落库时靠 @@unique([runId, seq]) 防重。
 */
export interface ToolEventBase {
  runId: string;
  seq: number; // 单 run 内单调递增，从 0 开始
  ts: string; // ISO 时间
}

export type ToolEvent =
  | (ToolEventBase & { type: "started" })
  | (ToolEventBase & { type: "output"; stream: "stdout" | "stderr"; text: string })
  | (ToolEventBase & { type: "artifact"; artifactId: string; path?: string })
  | (ToolEventBase & { type: "completed"; exitCode: number })
  | (ToolEventBase & { type: "failed"; error: ToolError });
