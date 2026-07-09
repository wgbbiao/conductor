// e2e 配置：加载根 .env（DATABASE_URL/REDIS_URL/JWT_SECRET）早于 test 文件 import config
// cwd 可能在根或 apps/api，两个路径都试
for (const p of [".env", "../../.env"]) {
  try {
    process.loadEnvFile(p);
    break;
  } catch {
    // 尝试下一个路径
  }
}

import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // e2e 实例化 NestJS app 走 DI，需要 emitDecoratorMetadata；esbuild 不支持，用 swc 编译
  plugins: [swc.vite()],
  test: {
    environment: "node",
    include: ["test/**/*.e2e-spec.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
    // loadEnvFile 只改主进程 process.env；test 由 vitest 注入 worker，确保 env 可达
    env: {
      DATABASE_URL: process.env.DATABASE_URL ?? "",
      REDIS_URL: process.env.REDIS_URL ?? "",
      JWT_SECRET: process.env.JWT_SECRET ?? "",
    },
  },
});
