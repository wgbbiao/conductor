import { Logger, Module, OnModuleInit } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { PrismaService } from "./prisma/prisma.service";
import { JwtService } from "./auth/jwt.service";
import { AuthService } from "./auth/auth.service";
import { AuthController } from "./auth/auth.controller";
import { JwtAuthGuard } from "./auth/jwt-auth.guard";
import { UsersController } from "./users/users.controller";
import { UsersService } from "./users/users.service";
import { AuditService } from "./events/audit.service";
import { MockToolProvider } from "./tools/mock-tool-provider";
import { ToolRegistryService } from "./tools/tool-registry.service";
import { config } from "./config";

@Module({
  controllers: [AuthController, UsersController],
  providers: [
    PrismaService,
    JwtService,
    AuthService,
    UsersService,
    AuditService,
    MockToolProvider,
    ToolRegistryService,
    // 全局守卫：所有 REST 默认需 JWT 鉴权，登录接口用 @Public 豁免
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule implements OnModuleInit {
  private readonly logger = new Logger("AppModule");

  constructor(registry: ToolRegistryService, mock: MockToolProvider) {
    // Phase 1 仅注册 mock provider
    registry.register(mock);
  }

  onModuleInit(): void {
    // fail-fast：JWT_SECRET / DATABASE_URL 为空则拒绝启动
    if (!config.jwtSecret) {
      throw new Error("JWT_SECRET 未配置，拒绝启动：请在 .env 设置 JWT_SECRET");
    }
    if (!config.databaseUrl) {
      throw new Error("DATABASE_URL 未配置，拒绝启动");
    }
    this.logger.log("启动配置校验通过（JWT_SECRET / DATABASE_URL 已就绪）");
  }
}
