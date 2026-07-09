import { Injectable } from "@nestjs/common";
import type { ToolProvider, ToolRegistry } from "@conductor/core";

/** NestJS 实现的 ToolRegistry：按 provider.id 注册/查找 */
@Injectable()
export class ToolRegistryService implements ToolRegistry {
  private readonly providers = new Map<string, ToolProvider>();

  register(provider: ToolProvider): void {
    this.providers.set(provider.id, provider);
  }

  get(id: string): ToolProvider | undefined {
    return this.providers.get(id);
  }

  list(): readonly ToolProvider[] {
    return [...this.providers.values()];
  }
}
