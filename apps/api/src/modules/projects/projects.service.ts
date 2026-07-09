import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  create(name: string, description = "") {
    return this.prisma.project.create({ data: { name, description } });
  }

  list() {
    return this.prisma.project.findMany({ orderBy: { createdAt: "desc" } });
  }

  get(id: string) {
    return this.prisma.project.findUniqueOrThrow({ where: { id } });
  }
}
