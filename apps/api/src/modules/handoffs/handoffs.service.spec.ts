import { ServiceUnavailableException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { HandoffsService } from "./handoffs.service";

describe("HandoffsService", () => {
  it("approve：GitHub CLI 未登录时恢复审批状态并返回可操作的 503", async () => {
    const handoff = {
      id: "handoff_1",
      workItemId: "work_item_1",
      status: "pending",
      fromStatus: "review",
      toStatus: "done",
    };
    const tx = {
      handoff: {
        findUniqueOrThrow: vi.fn().mockResolvedValue(handoff),
        update: vi.fn().mockResolvedValue(null),
      },
      workItem: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({ projectId: "project_1", title: "测试 PR" }),
        update: vi.fn().mockResolvedValueOnce({ id: handoff.workItemId, status: "done" }).mockResolvedValueOnce({
          id: handoff.workItemId,
          status: "review",
        }),
      },
      toolRun: { findFirst: vi.fn().mockResolvedValue({ branch: "conductor/work_item_1" }) },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)),
      auditEvent: { create: vi.fn().mockResolvedValue(null) },
    };
    const audit = { record: vi.fn().mockResolvedValue(null) };
    const git = {
      hasChanges: vi.fn().mockReturnValue(false),
      commit: vi.fn(),
      push: vi.fn(),
    };
    const pr = {
      create: vi.fn(() => {
        throw new Error("To get started with GitHub CLI, please run: gh auth login");
      }),
    };
    const service = new HandoffsService(prisma as never, audit as never, git as never, pr as never);

    let caught: unknown;
    try {
      await service.approve(handoff.id, "user_1");
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ServiceUnavailableException);
    expect((caught as Error).message).toContain("GitHub CLI 未登录");

    expect(tx.handoff.update).toHaveBeenLastCalledWith({
      where: { id: handoff.id },
      data: { status: "pending", decidedBy: null, decidedAt: null },
    });
    expect(tx.workItem.update).toHaveBeenLastCalledWith({
      where: { id: handoff.workItemId },
      data: { status: "review" },
    });
  });
});
