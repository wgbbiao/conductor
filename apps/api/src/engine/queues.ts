import { config } from "../config";

/** ToolRun 任务队列名（Queue 与 Worker 通过 Redis 同名队列通信，不需共享实例） */
export const TOOL_RUNS_QUEUE = "tool-runs";

/**
 * 解析 REDIS_URL 为 ioredis 配置对象，交给 BullMQ 内部创建连接。
 * 不在 api 侧创建 Redis 实例，避免与 bullmq bundled ioredis 版本冲突。
 * 每次返回新对象，Queue/Worker/各 app 实例各自创建连接，随生命周期关闭。
 */
export function redisConnectionOpts() {
  const u = new URL(config.redisUrl);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    password: u.password || undefined,
    maxRetriesPerRequest: null, // BullMQ 要求
  };
}
