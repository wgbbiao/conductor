import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { CreateProjectDto } from "./dto";
import { ProjectsService } from "./projects.service";

@Controller()
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Post("projects")
  create(@Body() dto: CreateProjectDto) {
    return this.projects.create(dto.name, dto.description);
  }

  @Get("projects")
  list() {
    return this.projects.list();
  }

  @Get("projects/:id")
  get(@Param("id") id: string) {
    return this.projects.get(id);
  }
}
