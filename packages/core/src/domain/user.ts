/**
 * User 领域类型（多用户就绪建模，P1.5）。
 * 即使 P1.5 只有单用户，字段也按多人设计，不为单用户简化。
 */

/** 角色：P1.5 仅骨架，完整角色矩阵留 P4 */
export type UserRole = "admin" | "member";

export interface User {
  id: string; // usr_xxx
  email: string; // 登录凭据，唯一
  displayName: string;
  role: UserRole; // 默认 admin（P1.5 单用户阶段）
  createdAt: string;
  updatedAt: string;
}
