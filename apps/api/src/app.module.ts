import { Logger, Module, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import type { Worker } from "bullmq";
import { PrismaService } from "./prisma/prisma.service";
import { JwtService } from "./auth/jwt.service";
import { AuthService } from "./auth/auth.service";
import { AuthController } from "./auth/auth.controller";
import { JwtAuthGuard } from "./auth/jwt-auth.guard";
import { UsersController } from "./users/users.controller";
import { UsersService } from "./users/users.service";
import { AuditService } from "./events/audit.service";
import { EventBusService } from "./events/event-bus.service";
import { MockToolProvider } from "./tools/mock-tool-provider";
import { ToolRegistryService } from "./tools/tool-registry.service";
import { ToolRunService } from "./engine/tool-run.service";
import { startToolRunWorker } from "./engine/tool-run.worker";
import { HandoffsController } from "./modules/handoffs/handoffs.controller";
import { HandoffsService } from "./modules/handoffs/handoffs.service";
import { config } from "./config";

@Module({
  controllers: [AuthController, UsersController, HandoffsController],
  providers: [
    PrismaService,
    JwtService,
    AuthService,
    UsersService,
    AuditService,
    EventBusService,
    MockToolProvider,
    ToolRegistryService,
    ToolRunService,
    HandoffsService,
    // 全局守卫：所有 REST 默认需 JWT 鉴权，登录接口用 @Public 豁免
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger("AppModule");
  private worker?: Worker;

  constructor(
    private readonly registry: ToolRegistryService,
    mock: MockToolProvider,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly bus: EventBusService,
    private readonly toolRuns: ToolRunService,
  ) {
    // Phase 1 仅注册 mock provider
    registry.register(mock);
  }

  async onModuleInit(): Promise<void> {
    if (!config.jwtSecret) throw new Error("JWT_SECRET 未配置，拒绝启动：请在 .env 设置 JWT_SECRET");
    if (!config.databaseUrl) throw new Error("DATABASE_URL 未配置，拒绝启动");
    this.logger.log("启动配置校验通过（JWT_SECRET / DATABASE_URL 已就绪）");

    // 清理孤儿 running ToolRun（崩溃残留）
    const recovered = await this.toolRuns.cleanupOrphanRuns();
    if (recovered > 0) this.logger.log(`清理 ${recovered} 个孤儿 running ToolRun`);

    // 启动 BullMQ worker 消费 tool-runs 队列
    this.worker = startToolRunWorker({
      prisma: this.prisma,
      registry: this.registry,
      audit: this.audit,
      bus: this.bus,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}
