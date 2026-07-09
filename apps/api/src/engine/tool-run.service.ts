import { BadRequestException, Injectable, OnModuleDestroy } from "@nestjs/common";
import { Queue } from "bullmq";
import { canTransition, defaultWorkflowDefinition } from "@conductor/core";
import { ShellRunner } from "../common/shell-runner";
import { AuditService } from "../events/audit.service";
import { GitService } from "../modules/workspace/git.service";
import { WorkspaceService } from "../modules/workspace/workspace.service";
import { PrismaService } from "../prisma/prisma.service";
import { TOOL_RUNS_QUEUE, redisConnectionOpts } from "./queues";

@Injectable()
export class ToolRunService implements OnModuleDestroy {
  private readonly queue: Queue;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly workspace: WorkspaceService,
    private readonly git: GitService,
    private readonly runner: ShellRunner,
  ) {
    // 每个 app 实例持有自己的 queue，随生命周期关闭（避免模块级连接泄漏）
    this.queue = new Queue(TOOL_RUNS_QUEUE, { connection: redisConnectionOpts() });
  }

  /**
   * 幂等启动：相同 (workItemId, idempotencyKey) 返回已有 ToolRun。
   * 事务内只写状态 + 事件（事实源），事务提交后再入队（落实 ADR-0002）。
   */
  async start(workItemId: string, prompt: string, idempotencyKey: string, providerId?: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.toolRun.findUnique({
        where: { workItemId_idempotencyKey: { workItemId, idempotencyKey } },
      });
      if (existing) return { toolRun: existing, project: null }; // 幂等命中

      const workItem = await tx.workItem.findUniqueOrThrow({
        where: { id: workItemId },
        include: {
          project: {
            select: { id: true, repoUrl: true, defaultBranch: true },
          },
        },
      });
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

      const resolvedProviderId = providerId ?? (workItem.project.repoUrl ? "codex" : "mock");
      const created = await tx.toolRun.create({
        data: { workItemId, providerId: resolvedProviderId, idempotencyKey, prompt, status: "queued" },
      });
      await tx.workItem.update({ where: { id: workItemId }, data: { currentToolRunId: created.id } });
      await this.audit.record(tx, {
        actorType: "system", actorId: "engine", action: "tool_run.created",
        subjectType: "ToolRun", subjectId: created.id, payload: { providerId: resolvedProviderId },
      });
      return { toolRun: created, project: workItem.project };
    });

    if (!result.project) return result.toolRun;

    // 事务提交后再入队
    try {
      await this.workspace.ensureCloned(result.project);
      this.workspace.syncDefault(result.project.id, result.project.defaultBranch);
      const baseCommit = this.git.baseCommit(result.project.id, result.project.defaultBranch);
      const branch = `conductor/${workItemId}`;
      this.runner.run("git", ["checkout", "-b", branch, baseCommit], {
        cwd: this.workspace.repoPath(result.project.id),
      });
      await this.prisma.toolRun.update({
        where: { id: result.toolRun.id },
        data: { branch, baseCommit },
      });
      await this.queue.add("run", { toolRunId: result.toolRun.id });
    } catch (error) {
      await this.markStartFailed(result.toolRun.id, workItemId, error);
      throw error;
    }
    return result.toolRun;
  }

  private async markStartFailed(toolRunId: string, workItemId: string, error: unknown): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.toolRun.update({
        where: { id: toolRunId },
        data: { status: "failed", finishedAt: new Date() },
      });
      await tx.workItem.update({ where: { id: workItemId }, data: { status: "failed" } });
      await this.audit.record(tx, {
        actorType: "system",
        actorId: "engine",
        action: "tool_run.start_failed",
        subjectType: "ToolRun",
        subjectId: toolRunId,
        payload: { workItemId, message: error instanceof Error ? error.message : String(error) },
      });
    });
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

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
