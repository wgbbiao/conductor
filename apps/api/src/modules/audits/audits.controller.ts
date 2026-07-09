import { Controller, Get, Query } from "@nestjs/common";
import { AuditsService } from "./audits.service";

@Controller("audit-events")
export class AuditsController {
  constructor(private readonly audits: AuditsService) {}

  @Get()
  list(@Query("subjectType") subjectType?: string, @Query("subjectId") subjectId?: string) {
    return this.audits.list({ subjectType, subjectId });
  }
}
