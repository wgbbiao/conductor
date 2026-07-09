import { BadRequestException, Injectable } from "@nestjs/common";
import { canTransition, defaultWorkflowDefinition } from "@conductor/core";
import { AuditService } from "../events/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { toolRunsQueue } from "./queues";

@Injectable()
export class ToolRunService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * 幂等启动：相同 (workItemId, idempotencyKey) 返回已有 ToolRun。
   * 事务内只写状态 + 事件（事实源），事务提交后再入队（落实 ADR-0002：状态先落库再驱动执行）。
   */
  async start(workItemId: string, prompt: string, idempotencyKey: string, providerId = "mock") {
    const toolRun = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.toolRun.findUnique({
        where: { workItemId_idempotencyKey: { workItemId, idempotencyKey } },
      });
      if (existing) return existing; // 幂等命中

      const workItem = await tx.workItem.findUniqueOrThrow({ where: { id: workItemId } });
      // 若 WorkItem 非 running，尝试 ready -> running；否则拒绝
      if (workItem.status !== "running") {
        if (workItem.status === "ready" && canTransition(defaultWorkflowDefinition, "ready", "running")) {
          await tx.workItem.update({ where: { id: workItemId }, data: { status: "running" } });
          await this.audit.record(tx, {
            actorType: "system", actorId: "engine", action: "transition",
            subjectType: "WorkItem", subjectId: workItemId, payload: { from: "ready", to: "running" },
          });
        } else {
          throw new BadRequestException(`WorkItem 状态 ${workItem.status} 不可启动 ToolRun`);
        }
      }

      const created = await tx.toolRun.create({
        data: { workItemId, providerId, idempotencyKey, prompt, status: "queued" },
      });
      await tx.workItem.update({ where: { id: workItemId }, data: { currentToolRunId: created.id } });
      await this.audit.record(tx, {
        actorType: "system", actorId: "engine", action: "tool_run.created",
        subjectType: "ToolRun", subjectId: created.id, payload: { providerId },
      });
      return created;
    });

    // 事务提交后再入队，保证 worker 消费时行已可见
    await toolRunsQueue.add("run", { toolRunId: toolRun.id });
    return toolRun;
  }

  /** 启动时清理孤儿 running ToolRun（崩溃残留）→ 标 failed + 审计 */
  async cleanupOrphanRuns(): Promise<number> {
    const orphans = await this.prisma.toolRun.findMany({ where: { status: "running" } });
    for (const run of orphans) {
      await this.prisma.$transaction(async (tx) => {
        await tx.toolRun.update({
          where: { id: run.id },
          data: { status: "failed", finishedAt: new Date() },
        });
        await this.audit.record(tx, {
          actorType: "system", actorId: "engine", action: "tool_run.orphan_recovered",
          subjectType: "ToolRun", subjectId: run.id, payload: { recovered: true },
        });
      });
    }
    return orphans.length;
  }
}
