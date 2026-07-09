import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class ArtifactsService {
  constructor(private readonly prisma: PrismaService) {}

  saveDiff(toolRunId: string, content: string) {
    return this.prisma.artifact.create({
      data: { toolRunRef: toolRunId, type: "diff", content },
    });
  }

  async getDiff(toolRunId: string): Promise<string | null> {
    const artifact = await this.prisma.artifact.findFirst({
      where: { toolRunRef: toolRunId, type: "diff" },
      orderBy: { createdAt: "desc" },
    });
    return artifact?.content ?? null;
  }
}
