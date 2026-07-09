import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  create(name: string, repoUrl = "git@github.com:wgbbiao/test-demo.git", description = "", defaultBranch = "main") {
    return this.prisma.project.create({ data: { name, repoUrl, defaultBranch, description } });
  }

  list() {
    return this.prisma.project.findMany({ orderBy: { createdAt: "desc" } });
  }

  get(id: string) {
    return this.prisma.project.findUniqueOrThrow({ where: { id } });
  }
}
