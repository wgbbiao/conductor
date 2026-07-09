import { Injectable } from "@nestjs/common";
import type { WorkItemType } from "@conductor/core";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class WorkItemsService {
  constructor(private readonly prisma: PrismaService) {}

  create(projectId: string, title: string, type: WorkItemType = "task", description = "") {
    return this.prisma.workItem.create({
      data: { projectId, title, type, description, status: "draft" },
    });
  }

  list(projectId?: string, type?: WorkItemType) {
    return this.prisma.workItem.findMany({
      where: { ...(projectId ? { projectId } : {}), ...(type ? { type } : {}) },
      orderBy: { createdAt: "desc" },
    });
  }

  get(id: string) {
    return this.prisma.workItem.findUniqueOrThrow({ where: { id } });
  }

  /** draft -> ready */
  markReady(id: string) {
    return this.prisma.workItem.update({ where: { id }, data: { status: "ready" } });
  }
}
