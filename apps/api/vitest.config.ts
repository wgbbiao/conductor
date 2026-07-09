import { defineConfig } from "vitest/config";

// 单元测试：node 环境，注入测试用 JWT_SECRET（早于 config 模块求值）
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts"],
    env: { JWT_SECRET: "test-jwt-secret-not-for-production" },
  },
});
