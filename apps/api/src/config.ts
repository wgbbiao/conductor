/** 全局配置：从环境变量读取，启动时由 AppModule 校验关键项（如 JWT_SECRET） */
export const config = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: process.env.DATABASE_URL ?? "",
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6380",
  workspaceRoot: process.env.WORKSPACE_ROOT ?? "./workspaces",
  featureCodexProvider: process.env.FEATURE_CODEX_PROVIDER === "true",
  jwtSecret: process.env.JWT_SECRET ?? "", // 必须由环境变量提供，空值拒绝启动
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
};
