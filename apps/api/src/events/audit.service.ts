import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

export interface AuditInput {
  actorType: "user" | "system" | "tool";
  actorId: string;
  action: string;
  subjectType: string;
  subjectId: string;
  payload?: Record<string, unknown>;
}

/**
 * 审计账本写入服务（落实 ADR-0002）。
 * record 必须在调用方 $transaction 内执行，传入事务客户端，
 * 保证状态变更与审计事件原子写入（不用 as any 绕过类型）。
 */
@Injectable()
export class AuditService {
  record(tx: Prisma.TransactionClient, input: AuditInput) {
    return tx.auditEvent.create({
      data: {
        actorType: input.actorType,
        actorId: input.actorId,
        action: input.action,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        payload: (input.payload ?? {}) as Prisma.InputJsonValue,
      },
    });
  }
}
