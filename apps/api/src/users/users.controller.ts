import { Controller, Get, Req } from "@nestjs/common";
import type { AuthContext } from "@conductor/core";
import { UsersService } from "./users.service";

@Controller("me")
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /** 当前登录用户（由全局守卫注入 req.user），返回不含 passwordHash */
  @Get()
  me(@Req() req: { user: AuthContext }) {
    return this.users.getById(req.user.userId);
  }
}
