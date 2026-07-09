import { Injectable } from "@nestjs/common";
import { EventEmitter } from "node:events";
import type { ToolEvent } from "@conductor/core";

/**
 * 进程内事件总线：worker 落库后 emit，WS gateway 订阅按 runId 推送。
 * 仅做实时投递，非事实源（事实源是 PG 的 ToolEvent 表）。
 */
@Injectable()
export class EventBusService {
  private readonly emitter = new EventEmitter();

  on(runId: string, cb: (e: ToolEvent) => void): () => void {
    this.emitter.on(runId, cb);
    return () => {
      this.emitter.off(runId, cb);
    };
  }

  emit(runId: string, event: ToolEvent): void {
    this.emitter.emit(runId, event);
  }
}
