import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { canTransition, defaultWorkflowDefinition, type WorkItemStatus } from "@conductor/core";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../events/audit.service";
import { GitService } from "../workspace/git.service";
import { PrService } from "../workspace/pr.service";

type Decision = "approved" | "rejected";
type PendingPr = {
  projectId: string;
  workItemId: string;
  branch: string;
  title: string;
};

@Injectable()
export class HandoffsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly git: GitService,
    private readonly pr: PrService,
  ) {}

  /** 取某 WorkItem 当前 pending 的 Handoff（review 等待审批时存在） */
  async findPending(workItemId: string) {
    return this.prisma.handoff.findFirst({
      where: { workItemId, status: "pending" },
      orderBy: { createdAt: "desc" },
    });
  }

  async findPendingOrThrow(workItemId: string) {
    const h = await this.findPending(workItemId);
    if (!h) throw new NotFoundException("无 pending Handoff");
    return h;
  }

  /** 批准：流转到 handoff.toStatus（审批后目标态，通常 done） */
  approve(handoffId: string, decidedBy: string, reason?: string) {
    return this.decide(handoffId, "approved", decidedBy, reason);
  }

  /** 打回：流转到 running（重新进入 AI 处理） */
  reject(handoffId: string, decidedBy: string, reason?: string) {
    return this.decide(handoffId, "rejected", decidedBy, reason);
  }

  /**
   * 落实 ADR-0002：Handoff 决议 + 状态转移 + AuditEvent 同事务原子写入。
   * toStatus 语义=审批后目标态（v1.3）；reject 固定流转到 running。
   */
  private async decide(handoffId: string, decision: Decision, decidedBy: string, reason?: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const handoff = await tx.handoff.findUniqueOrThrow({ where: { id: handoffId } });
      if (handoff.status !== "pending") {
        throw new ConflictException(`Handoff 已决议为 ${handoff.status}`);
      }

      const target: WorkItemStatus = decision === "approved" ? handoff.toStatus : "running";
      if (!canTransition(defaultWorkflowDefinition, handoff.fromStatus, target)) {
        throw new ConflictException(`非法转移 ${handoff.fromStatus} -> ${target}`);
      }

      const workItem = await tx.workItem.findUniqueOrThrow({
        where: { id: handoff.workItemId },
        select: { projectId: true, title: true },
      });

      await tx.handoff.update({
        where: { id: handoffId },
        data: { status: decision, decidedBy, decidedAt: new Date() },
      });
      const updatedWorkItem = await tx.workItem.update({
        where: { id: handoff.workItemId },
        data: { status: target },
      });
      await this.audit.record(tx, {
        actorType: "user",
        actorId: decidedBy,
        action: `handoff.${decision}`,
        subjectType: "WorkItem",
        subjectId: handoff.workItemId,
        payload: { handoffId, to: target, reason },
      });

      let pendingPr: PendingPr | null = null;
      if (decision === "approved") {
        const toolRun = await tx.toolRun.findFirst({
          where: { workItemId: handoff.workItemId },
          orderBy: { createdAt: "desc" },
          select: { branch: true },
        });
        if (toolRun?.branch) {
          pendingPr = {
            projectId: workItem.projectId,
            workItemId: handoff.workItemId,
            branch: toolRun.branch,
            title: workItem.title,
          };
        }
      }

      return { workItem: updatedWorkItem, pendingPr };
    });

    if (!result.pendingPr) {
      return result.workItem;
    }

    this.git.push(result.pendingPr.projectId, result.pendingPr.branch);
    const prUrl = this.pr.create(
      result.pendingPr.projectId,
      result.pendingPr.branch,
      result.pendingPr.title,
      `Conductor WorkItem ${result.pendingPr.workItemId}`,
    );
    await this.prisma.auditEvent.create({
      data: {
        actorType: "system",
        actorId: "engine",
        action: "pr.created",
        subjectType: "WorkItem",
        subjectId: result.pendingPr.workItemId,
        payload: { prUrl },
      },
    });
    return { ...result.workItem, prUrl };
  }
}
