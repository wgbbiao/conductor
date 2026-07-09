import { describe, it, expect, beforeEach } from "vitest";
import * as bcrypt from "bcrypt";
import { AuthService } from "./auth.service";
import { JwtService } from "./jwt.service";
import type { PrismaService } from "../prisma/prisma.service";

const PASSWORD = "correct-password";
const WRONG = "wrong-password";

/** 构造一个仅含 user.findUnique 的 PrismaService 替身 */
function mockPrisma(user: Record<string, unknown> | null): PrismaService {
  return { user: { findUnique: async () => user } } as unknown as PrismaService;
}

function userWith(hash: string): Record<string, unknown> {
  return {
    id: "u1",
    email: "a@conductor.dev",
    passwordHash: hash,
    displayName: "A",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("AuthService", () => {
  let hash: string;

  beforeEach(async () => {
    hash = await bcrypt.hash(PASSWORD, 4); // cost 4，测试加速
  });

  it("正确密码 → 返回 token + user（不含 passwordHash）", async () => {
    const svc = new AuthService(mockPrisma(userWith(hash)), new JwtService());
    const res = await svc.login("a@conductor.dev", PASSWORD);
    expect(typeof res.token).toBe("string");
    expect(res.token.length).toBeGreaterThan(0);
    expect(res.user.id).toBe("u1");
    expect(res.user).not.toHaveProperty("passwordHash");
  });

  it("错密码 → 抛 401 凭据无效", async () => {
    const svc = new AuthService(mockPrisma(userWith(hash)), new JwtService());
    await expect(svc.login("a@conductor.dev", WRONG)).rejects.toThrow("凭据无效");
  });

  it("用户不存在 → 抛 401 同消息（防枚举）", async () => {
    const svc = new AuthService(mockPrisma(null), new JwtService());
    await expect(svc.login("none@conductor.dev", PASSWORD)).rejects.toThrow("凭据无效");
  });

  it("validatePayload：用户存在返回上下文，不存在返回 null", async () => {
    const exists = new AuthService(mockPrisma(userWith(hash)), new JwtService());
    const ctx = await exists.validatePayload({ sub: "u1", role: "admin" });
    expect(ctx).toEqual({ userId: "u1", role: "admin" });

    const missing = new AuthService(mockPrisma(null), new JwtService());
    expect(await missing.validatePayload({ sub: "u1", role: "admin" })).toBeNull();
  });
});
