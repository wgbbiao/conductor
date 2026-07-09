import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ToolRunService } from "../../engine/tool-run.service";
import { CreateWorkItemDto, StartRunDto } from "./dto";
import { WorkItemsService } from "./work-items.service";

@Controller()
export class WorkItemsController {
  constructor(
    private readonly items: WorkItemsService,
    private readonly runs: ToolRunService,
  ) {}

  @Post("projects/:pid/work-items")
  create(@Param("pid") pid: string, @Body() dto: CreateWorkItemDto) {
    return this.items.create(pid, dto.title, dto.type ?? "task", dto.description);
  }

  @Get("work-items")
  list(@Query("projectId") projectId?: string) {
    return this.items.list(projectId);
  }

  @Get("work-items/:id")
  get(@Param("id") id: string) {
    return this.items.get(id);
  }

  @Post("work-items/:id/ready")
  ready(@Param("id") id: string) {
    return this.items.markReady(id);
  }

  @Post("work-items/:id/runs")
  run(@Param("id") id: string, @Body() dto: StartRunDto) {
    const providerId = typeof (dto as StartRunDto & { providerId?: unknown }).providerId === "string"
      ? (dto as StartRunDto & { providerId?: string }).providerId
      : undefined;
    return this.runs.start(id, dto.prompt, dto.idempotencyKey, providerId);
  }
}
