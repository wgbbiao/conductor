import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NestFactory } from "@nestjs/core";
import type { INestApplication } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";

const PASSWORD = "secret123";
const EMAIL = `e2e-${Math.random().toString(36).slice(2)}@conductor.dev`;

describe("auth e2e（登录 → token → /me）", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseURL: string;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule);
    await app.listen(0);
    const addr = app.getHttpServer().address() as { port: number };
    baseURL = `http://localhost:${addr.port}`;
    prisma = app.get(PrismaService);
    const hash = await bcrypt.hash(PASSWORD, 4);
    await prisma.user.create({
      data: { email: EMAIL, passwordHash: hash, displayName: "E2E", role: "admin" },
    });
  });

  afterAll(async () => {
    await prisma?.user.deleteMany({ where: { email: EMAIL } });
    await app?.close();
  });

  async function login(): Promise<{ token: string }> {
    const res = await fetch(`${baseURL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
    expect(res.status).toBe(201);
    return (await res.json()) as { token: string };
  }

  it("login 成功 → 返回 token", async () => {
    const data = await login();
    expect(data.token).toBeTruthy();
  });

  it("login 错密码 → 401", async () => {
    const res = await fetch(`${baseURL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: EMAIL, password: "wrong" }),
    });
    expect(res.status).toBe(401);
  });

  it("GET /me 无 token → 401", async () => {
    const res = await fetch(`${baseURL}/me`);
    expect(res.status).toBe(401);
  });

  it("GET /me 带正确 token → 200 + 当前用户（无 hash）", async () => {
    const { token } = await login();
    const res = await fetch(`${baseURL}/me`, { headers: { authorization: `Bearer ${token}` } });
    expect(res.status).toBe(200);
    const me = (await res.json()) as { email: string; passwordHash?: string };
    expect(me.email).toBe(EMAIL);
    expect(me.passwordHash).toBeUndefined();
  });

  it("GET /me 带错 token → 401", async () => {
    const res = await fetch(`${baseURL}/me`, {
      headers: { authorization: "Bearer invalid.token.here" },
    });
    expect(res.status).toBe(401);
  });
});
