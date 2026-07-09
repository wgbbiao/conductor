import { Controller, Get, Param } from "@nestjs/common";
import { ToolRunsService } from "./tool-runs.service";

@Controller()
export class ToolRunsController {
  constructor(private readonly runs: ToolRunsService) {}

  @Get("work-items/:id/runs")
  list(@Param("id") id: string) {
    return this.runs.listByWorkItem(id);
  }

  @Get("tool-runs/:id/events")
  events(@Param("id") id: string) {
    return this.runs.events(id);
  }
}
