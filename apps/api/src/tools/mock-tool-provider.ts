import { Injectable } from "@nestjs/common";
import type {
  ToolCapabilities,
  ToolEvent,
  ToolExecutionContext,
  ToolInvocation,
  ToolProvider,
  ValidationResult,
} from "@conductor/core";

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * MockToolProvider —— 模拟 AI 工具：确定性地产出流式事件，用于稳定验证闭环链路。
 * Phase 1 默认 provider；CodexProvider 由 FEATURE_CODEX_PROVIDER 门控，本 Phase 仅留契约。
 */
@Injectable()
export class MockToolProvider implements ToolProvider {
  readonly id = "mock";
  readonly displayName = "Mock Provider";

  async capabilities(): Promise<ToolCapabilities> {
    return { streaming: true, cancelable: true, capabilities: ["mock"] };
  }

  async validate(input: ToolInvocation): Promise<ValidationResult> {
    if (!input.prompt?.trim()) {
      return {
        valid: false,
        error: { code: "EMPTY_PROMPT", message: "prompt 不能为空", retryable: false },
      };
    }
    return { valid: true };
  }

  async *execute(input: ToolInvocation, ctx: ToolExecutionContext): AsyncIterable<ToolEvent> {
    let seq = 0;
    const ts = (): string => new Date().toISOString();

    yield { type: "started", runId: input.toolRunId, seq: seq++, ts: ts() };

    const words = `[mock] 处理: ${input.prompt}`.split(" ");
    for (const word of words) {
      if (ctx.signal.aborted) return; // 响应取消
      await wait(5);
      yield { type: "output", runId: input.toolRunId, seq: seq++, ts: ts(), stream: "stdout", text: `${word} ` };
    }

    yield { type: "completed", runId: input.toolRunId, seq: seq++, ts: ts(), exitCode: 0 };
  }

  async cancel(runId: string, reason?: string): Promise<void> {
    // Mock 通过 AbortSignal 取消（execute 内检查 ctx.signal.aborted）；此处仅留接口
    void runId;
    void reason;
  }
}
