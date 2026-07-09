import {
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import type { ToolEvent } from "@conductor/core";
import { EventBusService } from "./event-bus.service";

/**
 * socket.io 网关：客户端 emit("subscribe", { runId }) → 订阅该 run 的实时 ToolEvent。
 * 实时投递非事实源（事实源是 PG ToolEvent 表）。
 */
@WebSocketGateway({ cors: true })
export class EventsGateway implements OnGatewayDisconnect {
  @WebSocketServer() server!: Server;
  private readonly unsubs = new Map<string, Array<() => void>>();

  constructor(private readonly bus: EventBusService) {}

  @SubscribeMessage("subscribe")
  handleSubscribe(client: Socket, payload: { runId: string }) {
    const { runId } = payload;
    const unsub = this.bus.on(runId, (event: ToolEvent) => {
      client.emit(`tool-event:${runId}`, event);
    });
    const list = this.unsubs.get(client.id) ?? [];
    list.push(unsub);
    this.unsubs.set(client.id, list);
    return { ok: true, runId };
  }

  handleDisconnect(client: Socket): void {
    for (const unsub of this.unsubs.get(client.id) ?? []) unsub();
    this.unsubs.delete(client.id);
  }
}
