import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { INestApplication } from "@nestjs/common";
import type { AddressInfo } from "node:net";
import { NestFactory } from "@nestjs/core";
import { IoAdapter } from "@nestjs/platform-socket.io";
import { io as ioc } from "socket.io-client";
import type { Socket } from "socket.io-client";
import * as bcrypt from "bcrypt";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";

const PASSWORD = "secret123";
const EMAIL = "smoke-" + Math.random().toString(36).slice(2) + "@conductor.dev";

async function waitFor<T>(fn: () => Promise<T>, done: (t: T) => boolean, timeoutMs: number): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const t = await fn();
    if (done(t)) return t;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("waitFor 超时");
}

describe("闭环 smoke（报 bug → AI 修 → 人审批 → done）", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseURL: string;
  let authHeaders: Record<string, string>;
  let projectId: string;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule);
    app.useWebSocketAdapter(new IoAdapter(app));
    await app.listen(0);
    const addr = (app.getHttpServer().address()) as AddressInfo;
    baseURL = `http://localhost:${addr.port}`;
    prisma = app.get(PrismaService);

    const hash = await bcrypt.hash(PASSWORD, 4);
    await prisma.user.create({ data: { email: EMAIL, passwordHash: hash, displayName: "Smoke", role: "admin" } });

    const loginRes = await fetch(`${baseURL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
    const { token } = (await loginRes.json()) as { token: string };
    authHeaders = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

    const project = await prisma.project.create({ data: { name: "smoke-proj" } });
    projectId = project.id;
  });

  afterAll(async () => {
    await app?.close();
  });

  function auth(path: string, init: RequestInit = {}): Promise<Response> {
    return fetch(`${baseURL}${path}`, {
      ...init,
      headers: { ...authHeaders, ...((init.headers as Record<string, string>) ?? {}) },
    });
  }

  it(
    "bug 跑通 Mock 闭环 + 人工审批，全程落库",
    async () => {
      // 1. 报一个 bug
      const wiRes = await auth(`/projects/${projectId}/work-items`, {
        method: "POST",
        body: JSON.stringify({ title: "登录白屏", type: "bug", description: "cookie 过期后 401" }),
      });
      const wi = (await wiRes.json()) as { id: string; status: string; type: string };
      expect(wi.status).toBe("draft");
      expect(wi.type).toBe("bug");

      // 2. draft -> ready
      await auth(`/work-items/${wi.id}/ready`, { method: "POST" });

      // 3. WS 先连好（等待 connect）
      const sock: Socket = ioc(baseURL);
      await new Promise<void>((resolve) => sock.on("connect", () => resolve()));

      // 4. 触发 AI(Mock) 修复
      const runRes = await auth(`/work-items/${wi.id}/runs`, {
        method: "POST",
        body: JSON.stringify({ prompt: "修复登录白屏", idempotencyKey: "smoke-1" }),
      });
      const run = (await runRes.json()) as { id: string };
      expect(run.id).toBeTruthy();

      // 订阅该 run 的事件
      const received: unknown[] = [];
      sock.emit("subscribe", { runId: run.id });
      sock.on(`tool-event:${run.id}`, (e: unknown) => received.push(e));

      // 5. 等 ToolRun 成功 → WorkItem 进入 review
      const runFinal = await waitFor(
        () => prisma.toolRun.findUniqueOrThrow({ where: { id: run.id } }),
        (r) => r.status === "succeeded",
        8000,
      );
      expect(runFinal.status).toBe("succeeded");

      const wiReview = await waitFor(
        () => prisma.workItem.findUniqueOrThrow({ where: { id: wi.id } }),
        (w) => w.status === "review",
        8000,
      );
      expect(wiReview.status).toBe("review");

      // 事件落库（事实源）
      const events = await prisma.toolEvent.findMany({ where: { runId: run.id }, orderBy: { seq: "asc" } });
      expect(events.length).toBeGreaterThan(1);
      expect(events[0]?.type).toBe("started");
      expect(events.at(-1)?.type).toBe("completed");

      // 6. 人审批：找到 pending Handoff → approve → done
      const pendingRes = await auth(`/work-items/${wi.id}/handoffs/pending`);
      const handoff = (await pendingRes.json()) as { id: string };
      expect(handoff.id).toBeTruthy();

      const approveRes = await auth(`/handoffs/${handoff.id}/approve`, {
        method: "POST",
        body: JSON.stringify({ reason: "修复 OK" }),
      });
      const approved = (await approveRes.json()) as { status: string };
      expect(approved.status).toBe("done");

      // 7. 审计：有 handoff.approved 记录，actor = 真 userId
      const audits = await prisma.auditEvent.findMany({
        where: { subjectType: "WorkItem", subjectId: wi.id, action: "handoff.approved" },
      });
      expect(audits.length).toBe(1);
      expect(audits[0]?.actorType).toBe("user");

      // 8. WS 收到事件（实时投递；可能因 worker 极快而部分 missed，但应至少收到若干）
      expect(received.length).toBeGreaterThan(0);

      sock.close();
    }
  );
});
