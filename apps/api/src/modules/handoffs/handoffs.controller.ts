import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import type { AuthContext } from "@conductor/core";
import { HandoffsService } from "./handoffs.service";
import { DecideHandoffDto } from "./dto";

@Controller()
export class HandoffsController {
  constructor(private readonly handoffs: HandoffsService) {}

  @Get("work-items/:id/handoffs/pending")
  pending(@Param("id") id: string) {
    return this.handoffs.findPendingOrThrow(id);
  }

  @Post("handoffs/:id/approve")
  approve(@Param("id") id: string, @Body() dto: DecideHandoffDto, @Req() req: { user: AuthContext }) {
    return this.handoffs.approve(id, req.user.userId, dto.reason);
  }

  @Post("handoffs/:id/reject")
  reject(@Param("id") id: string, @Body() dto: DecideHandoffDto, @Req() req: { user: AuthContext }) {
    return this.handoffs.reject(id, req.user.userId, dto.reason);
  }
}
