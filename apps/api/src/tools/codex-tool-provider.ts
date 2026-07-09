import { spawn } from "node:child_process";
import { Injectable } from "@nestjs/common";
import type {
  ToolCapabilities,
  ToolEvent,
  ToolExecutionContext,
  ToolInvocation,
  ToolProvider,
  ValidationResult,
} from "@conductor/core";

@Injectable()
export class CodexProvider implements ToolProvider {
  readonly id = "codex";
  readonly displayName = "Codex";

  async capabilities(): Promise<ToolCapabilities> {
    return { streaming: true, cancelable: true, capabilities: ["codex", "code-edit"] };
  }

  async validate(input: ToolInvocation): Promise<ValidationResult> {
    if (!input.prompt?.trim()) {
      return {
        valid: false,
        error: { code: "EMPTY_PROMPT", message: "prompt 不能为空", retryable: false },
      };
    }

    if (!input.workspacePath?.trim()) {
      return {
        valid: false,
        error: { code: "NO_WORKSPACE", message: "缺少 workspace 路径", retryable: false },
      };
    }

    return { valid: true };
  }

  async *execute(input: ToolInvocation, ctx: ToolExecutionContext): AsyncIterable<ToolEvent> {
    let seq = 0;
    const nextEvent = <T extends Omit<ToolEvent, "runId" | "seq" | "ts">>(event: T): ToolEvent => ({
      ...event,
      runId: input.toolRunId,
      seq: seq++,
      ts: new Date().toISOString(),
    });
    const queue: ToolEvent[] = [];
    let finished = false;
    let wake: (() => void) | undefined;
    let failure: ToolEvent | undefined;
    let exitCode = 0;

    const push = (event: Omit<ToolEvent, "runId" | "seq" | "ts">): void => {
      queue.push(nextEvent(event));
      wake?.();
      wake = undefined;
    };
    const closeQueue = (): void => {
      finished = true;
      wake?.();
      wake = undefined;
    };

    yield nextEvent({ type: "started" });

    // Controller already confirmed current CLI syntax is `codex exec [PROMPT]`.
    const child = spawn("codex", ["exec", input.prompt], {
      cwd: input.workspacePath,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const onAbort = (): void => {
      child.kill("SIGTERM");
    };

    ctx.signal.addEventListener("abort", onAbort, { once: true });
    child.stdout.on("data", (chunk: Buffer | string) => {
      const text = chunk.toString();
      if (text.length > 0) {
        push({ type: "output", stream: "stdout", text });
      }
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      const text = chunk.toString();
      if (text.length > 0) {
        push({ type: "output", stream: "stderr", text });
      }
    });
    child.on("error", (error: Error) => {
      failure = nextEvent({
        type: "failed",
        error: { code: "CODEX_ERROR", message: error.message, retryable: false },
      });
      closeQueue();
    });
    child.on("close", (code: number | null) => {
      exitCode = code ?? 0;
      closeQueue();
    });

    try {
      while (!finished || queue.length > 0) {
        if (queue.length === 0) {
          await new Promise<void>((resolve) => {
            wake = resolve;
          });
          continue;
        }

        const event = queue.shift();
        if (event) {
          yield event;
        }
      }
    } finally {
      ctx.signal.removeEventListener("abort", onAbort);
    }

    if (failure) {
      yield failure;
      return;
    }

    if (!ctx.signal.aborted) {
      yield nextEvent({ type: "completed", exitCode });
    }
  }

  async cancel(runId: string, reason?: string): Promise<void> {
    void runId;
    void reason;
  }
}
