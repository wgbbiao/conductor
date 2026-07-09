import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { canTransition, defaultWorkflowDefinition, type WorkItemStatus } from "@conductor/core";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../events/audit.service";

type Decision = "approved" | "rejected";

@Injectable()
export class HandoffsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
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
    return this.prisma.$transaction(async (tx) => {
      const handoff = await tx.handoff.findUniqueOrThrow({ where: { id: handoffId } });
      if (handoff.status !== "pending") {
        throw new ConflictException(`Handoff 已决议为 ${handoff.status}`);
      }

      const target: WorkItemStatus = decision === "approved" ? handoff.toStatus : "running";
      if (!canTransition(defaultWorkflowDefinition, handoff.fromStatus, target)) {
        throw new ConflictException(`非法转移 ${handoff.fromStatus} -> ${target}`);
      }

      await tx.handoff.update({
        where: { id: handoffId },
        data: { status: decision, decidedBy, decidedAt: new Date() },
      });
      await tx.workItem.update({
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
      return tx.workItem.findUniqueOrThrow({ where: { id: handoff.workItemId } });
    });
  }
}
