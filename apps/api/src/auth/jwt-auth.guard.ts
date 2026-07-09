import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { AuthContext } from "@conductor/core";
import { IS_PUBLIC_KEY } from "./public.decorator";
import { JwtService } from "./jwt.service";
import { AuthService } from "./auth.service";

/** 全局 JWT 守卫：解析 Bearer token → 校验 → 注入 req.user（AuthContext）；@Public 接口豁免 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly auth: AuthService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    // @Public 装饰的接口跳过鉴权
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<{
      headers: { authorization?: string };
      user?: AuthContext;
    }>();
    const header = req.headers.authorization ?? "";
    const match = /^Bearer (.+)$/.exec(header);
    if (!match?.[1]) throw new UnauthorizedException("缺少 Bearer token");

    try {
      const payload = this.jwt.verify(match[1]);
      const authCtx = await this.auth.validatePayload(payload);
      if (!authCtx) throw new UnauthorizedException("token 对应用户不存在");
      req.user = { userId: authCtx.userId, role: authCtx.role as AuthContext["role"] };
      return true;
    } catch (err) {
      // 已是 UnauthorizedException 则原样抛出，避免覆盖具体原因
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException("token 无效或已过期");
    }
  }
}
