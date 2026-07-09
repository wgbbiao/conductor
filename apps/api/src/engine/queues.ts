import { Queue } from "bullmq";
import { config } from "../config";

/**
 * 解析 REDIS_URL 为 ioredis 配置对象，交给 BullMQ 内部创建连接。
 * 不在 api 侧创建 Redis 实例，避免与 bullmq bundled ioredis 版本冲突。
 * Redis 仅承载队列，不承载真实状态（ADR-0002）。
 */
function parseRedisUrl(url: string) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    password: u.password || undefined,
    maxRetriesPerRequest: null, // BullMQ 要求
  };
}

export const connection = parseRedisUrl(config.redisUrl);

// ToolRun 任务队列：ToolRunService 入队，tool-run.worker 消费
export const toolRunsQueue = new Queue("tool-runs", { connection });
