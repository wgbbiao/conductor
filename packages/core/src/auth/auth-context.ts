import type { UserRole } from "../domain/user";

/** 鉴权后注入请求上下文；对齐 core/policy 的 PolicyContext.userId */
export interface AuthContext {
  userId: string;
  role: UserRole;
}

/** 是否管理员（P1.5 角色骨架，仅判 admin） */
export function isAdmin(ctx: AuthContext): boolean {
  return ctx.role === "admin";
}
