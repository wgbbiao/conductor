import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolExecutionContext, ToolInvocation } from "@conductor/core";
import { CodexProvider } from "./codex-tool-provider";

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));

vi.mock("node:child_process", () => ({
  spawn: spawnMock,
}));

const base: ToolInvocation = {
  workItemId: "wi_1",
  toolRunId: "tr_1",
  prompt: "把背景白改蓝",
  workspacePath: "/tmp/repo",
  idempotencyKey: "k1",
};

type ToolEvent = { type: string; seq: number; runId: string; stream?: string; text?: string; exitCode?: number };

class FakeStream extends EventEmitter {
  emitData(text: string): void {
    this.emit("data", Buffer.from(text));
  }
}

class FakeChildProcess extends EventEmitter {
  readonly stdout = new FakeStream();
  readonly stderr = new FakeStream();
  kill = vi.fn();
}

async function collect(provider: CodexProvider, input: ToolInvocation, signal?: AbortSignal): Promise<ToolEvent[]> {
  const ctx: ToolExecutionContext = { signal: signal ?? new AbortController().signal };
  const events: ToolEvent[] = [];
  for await (const event of provider.execute(input, ctx)) {
    events.push(event);
  }
  return events;
}

describe("CodexProvider", () => {
  beforeEach(() => {
    spawnMock.mockReset();
  });

  it("id/displayName", () => {
    const provider = new CodexProvider();
    expect(provider.id).toBe("codex");
    expect(provider.displayName).toBe("Codex");
  });

  it("validate：非空 prompt 通过", async () => {
    const provider = new CodexProvider();
    expect((await provider.validate(base)).valid).toBe(true);
    expect((await provider.validate({ ...base, prompt: "  " })).valid).toBe(false);
  });

  it("capabilities 声明流式+可取消", async () => {
    const provider = new CodexProvider();
    const capabilities = await provider.capabilities();
    expect(capabilities.streaming).toBe(true);
    expect(capabilities.cancelable).toBe(true);
  });

  it("spawn codex exec 并流式产出 started → output* → completed", async () => {
    const provider = new CodexProvider();
    const child = new FakeChildProcess();
    spawnMock.mockReturnValue(child);

    const pending = collect(provider, base);

    await vi.waitFor(() => {
      expect(spawnMock).toHaveBeenCalledTimes(1);
    });
    child.stdout.emitData("first chunk");
    child.stderr.emitData("warn chunk");
    child.emit("close", 0);

    const events = await pending;
    expect(spawnMock).toHaveBeenCalledWith("codex", ["exec", "--sandbox", "workspace-write", "--ask-for-approval", "never", base.prompt], {
      cwd: base.workspacePath,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    expect(events.map((event) => event.type)).toEqual(["started", "output", "output", "completed"]);
    expect(events[1]).toMatchObject({ stream: "stdout", text: "first chunk" });
    expect(events[2]).toMatchObject({ stream: "stderr", text: "warn chunk" });
    expect(events[3]).toMatchObject({ exitCode: 0 });
    expect(events.map((event) => event.seq)).toEqual([0, 1, 2, 3]);
    expect(events.every((event) => event.runId === base.toolRunId)).toBe(true);
  });

  it("abort 时终止子进程且不产出 completed", async () => {
    const provider = new CodexProvider();
    const child = new FakeChildProcess();
    spawnMock.mockReturnValue(child);
    const controller = new AbortController();

    const pending = collect(provider, base, controller.signal);

    await vi.waitFor(() => {
      expect(spawnMock).toHaveBeenCalledTimes(1);
    });
    controller.abort();
    child.emit("close", null);

    const events = await pending;
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    expect(events.map((event) => event.type)).toEqual(["started"]);
  });

  it("signal 已取消时不启动 codex", async () => {
    const provider = new CodexProvider();
    const controller = new AbortController();
    controller.abort();

    const events = await collect(provider, base, controller.signal);

    expect(spawnMock).not.toHaveBeenCalled();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "failed",
      error: { code: "CODEX_ABORTED", retryable: false },
    });
  });
});
