import type { ToolProvider } from "./tool-provider.js";

/** ToolRegistry —— 工具注册表接口，供 api 层实现 */
export interface ToolRegistry {
  register(provider: ToolProvider): void;
  get(id: string): ToolProvider | undefined;
  list(): readonly ToolProvider[];
}
