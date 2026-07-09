import { defineConfig } from "vitest/config";

// core 是纯类型/纯函数包，无 IO，测试跑在 node 环境
export default defineConfig({
  test: { environment: "node", include: ["src/**/*.spec.ts"] },
});
