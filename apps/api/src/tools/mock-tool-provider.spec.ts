import { describe, it, expect } from "vitest";
import type { ToolExecutionContext, ToolInvocation } from "@conductor/core";
import { MockToolProvider } from "./mock-tool-provider";

const base: ToolInvocation = {
  workItemId: "wi_1",
  toolRunId: "tr_1",
  prompt: "hello world",
  workspacePath: "/tmp/ws",
  idempotencyKey: "k1",
};

async function collect(provider: MockToolProvider, input: ToolInvocation, signal?: AbortSignal): Promise<ToolEvent[]> {
  const ctx: ToolExecutionContext = { signal: signal ?? new AbortController().signal };
  const events: ToolEvent[] = [];
  for await (const e of provider.execute(input, ctx)) events.push(e);
  return events;
}

// 为避免循环引用类型问题，本地复述事件类型用于断言
type ToolEvent = { type: string; seq: number; runId: string };

describe("MockToolProvider", () => {
  const provider = new MockToolProvider();

  it("id 与 displayName", () => {
    expect(provider.id).toBe("mock");
    expect(provider.displayName).toBe("Mock Provider");
  });

  it("capabilities 声明流式+可取消", async () => {
    const cap = await provider.capabilities();
    expect(cap.streaming).toBe(true);
    expect(cap.cancelable).toBe(true);
  });

  it("validate：空 prompt 失败，非空通过", async () => {
    expect((await provider.validate({ ...base, prompt: "  " })).valid).toBe(false);
    expect((await provider.validate(base)).valid).toBe(true);
  });

  it("产出 started → output* → completed，seq 从 0 单调且唯一", async () => {
    const events = await collect(provider, base);
    const types = events.map((e) => e.type);
    expect(types[0]).toBe("started");
    expect(types[types.length - 1]).toBe("completed");
    const seqs = events.map((e) => e.seq);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    expect(new Set(seqs).size).toBe(seqs.length);
    expect(events.every((e) => e.runId === "tr_1")).toBe(true);
  });

  it("abort 后停止产出（仅 started，无 output/completed）", async () => {
    const ac = new AbortController();
    ac.abort(); // 预先 abort
    const events = await collect(provider, base, ac.signal);
    const types = events.map((e) => e.type);
    expect(types).toContain("started"); // started 在 abort 检查前产出
    expect(types).not.toContain("output");
    expect(types).not.toContain("completed");
  });
});
