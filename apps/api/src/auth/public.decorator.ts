import { SetMetadata } from "@nestjs/common";

/** 标记接口为公开（豁免全局 JWT 守卫），如 POST /auth/login */
export const IS_PUBLIC_KEY = "isPublic";
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
