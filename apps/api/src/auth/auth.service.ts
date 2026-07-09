import { Injectable, UnauthorizedException } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../prisma/prisma.service";
import { JwtService } from "./jwt.service";

/** 登录返回的用户信息（不含 passwordHash） */
export type SafeUser = {
  id: string;
  email: string;
  displayName: string;
  role: string;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  /** 登录：校验密码并签发 JWT。用户不存在与密码错误返回同一消息（防枚举） */
  async login(email: string, password: string): Promise<{ token: string; user: SafeUser }> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    // 用户不存在与密码错返回同一消息，防枚举
    const ok = user ? await bcrypt.compare(password, user.passwordHash) : false;
    if (!user || !ok) throw new UnauthorizedException("凭据无效");

    const token = this.jwt.sign({ sub: user.id, role: user.role });
    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    };
  }

  /** 校验 JWT payload，返回鉴权上下文（守卫用）。用户已被删除则返回 null */
  async validatePayload(payload: { sub: string; role: string }): Promise<{ userId: string; role: string } | null> {
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) return null;
    return { userId: user.id, role: user.role };
  }
}
