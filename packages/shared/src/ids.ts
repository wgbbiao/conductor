import { customAlphabet } from "nanoid";

// 去掉易混字符，URL 安全
const generator = customAlphabet("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz", 21);

/** 生成带前缀的唯一 id，如 newId("wi") -> "wi_xYz..." */
export function newId(prefix: string): string {
  return `${prefix}_${generator()}`;
}
