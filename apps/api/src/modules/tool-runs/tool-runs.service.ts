import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class ToolRunsService {
  constructor(private readonly prisma: PrismaService) {}

  listByWorkItem(workItemId: string) {
    return this.prisma.toolRun.findMany({
      where: { workItemId },
      orderBy: { createdAt: "desc" },
    });
  }

  events(runId: string) {
    return this.prisma.toolEvent.findMany({
      where: { runId },
      orderBy: { seq: "asc" },
    });
  }
}
