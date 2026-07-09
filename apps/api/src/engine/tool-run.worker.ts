import { Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { Worker, type Job } from "bullmq";
import type { WorkItemStatus } from "@conductor/core";
import type { AuditService } from "../events/audit.service";
import type { EventBusService } from "../events/event-bus.service";
import type { ArtifactsService } from "../modules/artifacts/artifacts.service";
import type { GitService } from "../modules/workspace/git.service";
import type { WorkspaceService } from "../modules/workspace/workspace.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { ToolRegistryService } from "../tools/tool-registry.service";
import { TOOL_RUNS_QUEUE, redisConnectionOpts } from "./queues";

const logger = new Logger("ToolRunWorker");
const RUN_TIMEOUT_MS = 60_000;

interface WorkerDeps {
  prisma: PrismaService;
  registry: ToolRegistryService;
  audit: AuditService;
  bus: EventBusService;
  workspace: WorkspaceService;
  git: GitService;
  artifacts: ArtifactsService;
}

/**
 * 启动 BullMQ worker：消费 tool-runs 队列 → provider 流式执行 →
 * ToolEvent 落库（seq 唯一防重）→ 成功流转到 review（创建 pending Handoff）/ 失败流转到 failed。
 */
export function startToolRunWorker(deps: WorkerDeps): Worker {
  const { prisma, registry, audit, bus, workspace, git, artifacts } = deps;

  const worker = new Worker(
    TOOL_RUNS_QUEUE,
    async (job: Job) => {
      const { toolRunId } = job.data as { toolRunId: string };
      const toolRun = await prisma.toolRun.findUniqueOrThrow({
        where: { id: toolRunId },
        include: { workItem: { include: { project: true } } },
      });
      const project = toolRun.workItem.project;
      const workspacePath = workspace.repoPath(project.id);
      const provider = registry.get(toolRun.providerId)
        ?? registry.get(project.repoUrl ? "codex" : "mock")
        ?? registry.get("mock");
      if (!provider) throw new Error(`provider ${toolRun.providerId} 未注册`);

      await prisma.toolRun.update({
        where: { id: toolRunId },
        data: { status: "running", startedAt: new Date() },
      });

      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), RUN_TIMEOUT_MS);

      try {
        for await (const event of provider.execute(
          {
            workItemId: toolRun.workItemId,
            toolRunId,
            prompt: toolRun.prompt,
            workspacePath,
            idempotencyKey: toolRun.idempotencyKey,
          },
          { signal: ac.signal },
        )) {
          // 落库：seq 唯一约束防重（事实源）
          await prisma.toolEvent.create({
            data: {
              runId: toolRunId,
              seq: event.seq,
              type: event.type,
              payload: event as unknown as Prisma.InputJsonValue,
            },
          });
          // 投递容错：bus 失败不中断流式落库（v1.3）
          try {
            bus.emit(toolRunId, event);
          } catch (e) {
            logger.error(`bus emit 失败 runId=${toolRunId}`, e as Error);
          }
        }

        if (toolRun.baseCommit && toolRun.branch) {
          const head = git.baseCommit(project.id, "HEAD");
          const diff = git.diff(project.id, toolRun.baseCommit, head);
          await artifacts.saveDiff(toolRunId, diff);
        }

        await prisma.toolRun.update({
          where: { id: toolRunId },
          data: { status: "succeeded", exitCode: 0, finishedAt: new Date() },
        });
        await transitionToReview(prisma, audit, toolRun.workItemId);
      } catch (e) {
        await prisma.toolRun
          .update({ where: { id: toolRunId }, data: { status: "failed", finishedAt: new Date() } })
          .catch((err: unknown) => logger.error(`标记 failed 失败 runId=${toolRunId}`, err));
        await transitionWorkItem(prisma, audit, toolRun.workItemId, "running", "failed").catch((err: unknown) =>
          logger.error("流转 failed 失败", err),
        );
        throw e;
      } finally {
        clearTimeout(timer);
      }
    },
    { connection: redisConnectionOpts() },
  );

  worker.on("failed", (job, err) => logger.error(`job ${job?.id ?? "?"} 失败: ${err.message}`));
  return worker;
}

/** WorkItem 状态流转（通用）：同事务写状态 + AuditEvent（落实 ADR-0002） */
async function transitionWorkItem(
  prisma: PrismaService,
  audit: AuditService,
  workItemId: string,
  from: WorkItemStatus,
  to: WorkItemStatus,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.workItem.update({ where: { id: workItemId }, data: { status: to } });
    await audit.record(tx, {
      actorType: "system", actorId: "engine", action: "transition",
      subjectType: "WorkItem", subjectId: workItemId, payload: { from, to },
    });
  });
}

/** running -> review：流转并创建 pending Handoff（demo 审批入口）。
 *  Handoff.toStatus=done（审批后目标态，v1.3 语义），fromStatus=review */
async function transitionToReview(
  prisma: PrismaService,
  audit: AuditService,
  workItemId: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.workItem.update({ where: { id: workItemId }, data: { status: "review" } });
    await tx.handoff.create({
      data: { workItemId, fromStatus: "review", toStatus: "done", status: "pending" },
    });
    await audit.record(tx, {
      actorType: "system", actorId: "engine", action: "transition",
      subjectType: "WorkItem", subjectId: workItemId, payload: { to: "review" },
    });
  });
}
