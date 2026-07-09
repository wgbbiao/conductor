import { describe, it, expect } from "vitest";
import { UnauthorizedException, type ExecutionContext } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import { JwtAuthGuard } from "./jwt-auth.guard";
import type { JwtService } from "./jwt.service";
import type { AuthService } from "./auth.service";

type Req = { headers: Record<string, string>; user?: unknown };

function makeCtx(req: Req): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

interface GuardOpts {
  isPublic?: boolean;
  verify?: (t: string) => { sub: string; role: string };
  validate?: (p: { sub: string; role: string }) => Promise<{ userId: string; role: string } | null>;
}

function makeGuard(opts: GuardOpts): JwtAuthGuard {
  const reflector = { getAllAndOverride: () => opts.isPublic ?? false } as unknown as Reflector;
  const jwt = {
    verify: opts.verify ?? (() => ({ sub: "u1", role: "admin" })),
  } as unknown as JwtService;
  const auth = {
    validatePayload: opts.validate ?? (async () => ({ userId: "u1", role: "admin" })),
  } as unknown as AuthService;
  return new JwtAuthGuard(reflector, jwt, auth);
}

describe("JwtAuthGuard", () => {
  it("@Public 接口直接放行（不校验 token）", async () => {
    const g = makeGuard({ isPublic: true });
    await expect(g.canActivate(makeCtx({ headers: {} }))).resolves.toBe(true);
  });

  it("无 Bearer → 401", async () => {
    const g = makeGuard({});
    await expect(g.canActivate(makeCtx({ headers: {} }))).rejects.toThrow(UnauthorizedException);
  });

  it("token 无效 → 401", async () => {
    const g = makeGuard({ verify: () => { throw new Error("bad token"); } });
    await expect(g.canActivate(makeCtx({ headers: { authorization: "Bearer xxx" } }))).rejects.toThrow(UnauthorizedException);
  });

  it("用户已删除（payload 校验返回 null）→ 401", async () => {
    const g = makeGuard({ validate: async () => null });
    await expect(g.canActivate(makeCtx({ headers: { authorization: "Bearer xxx" } }))).rejects.toThrow(UnauthorizedException);
  });

  it("有效 token → 放行并注入 req.user（AuthContext）", async () => {
    const req: Req = { headers: { authorization: "Bearer good" } };
    const g = makeGuard({ validate: async () => ({ userId: "u1", role: "admin" }) });
    await expect(g.canActivate(makeCtx(req))).resolves.toBe(true);
    expect(req.user).toEqual({ userId: "u1", role: "admin" });
  });
});
