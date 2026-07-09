import { randomBytes } from "node:crypto";

// URL 安全的随机 id 生成器（基于 Node 内置 crypto，无外部 ESM 依赖）
const generator = (): string => randomBytes(16).toString("base64url");

/** 生成带前缀的唯一 id，如 newId("wi") -> "wi_xYz..." */
export function newId(prefix: string): string {
  return `${prefix}_${generator()}`;
}
