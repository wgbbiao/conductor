import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class AuditsService {
  constructor(private readonly prisma: PrismaService) {}

  /** 按 subject 查询审计事件（审计回放 Tab 用） */
  list(filter: { subjectType?: string; subjectId?: string }) {
    return this.prisma.auditEvent.findMany({
      where: {
        ...(filter.subjectType ? { subjectType: filter.subjectType } : {}),
        ...(filter.subjectId ? { subjectId: filter.subjectId } : {}),
      },
      orderBy: { createdAt: "asc" },
    });
  }
}
