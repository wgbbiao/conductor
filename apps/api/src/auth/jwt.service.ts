import { Injectable } from "@nestjs/common";
import * as jwt from "jsonwebtoken";
import { config } from "../config";

/** jsonwebtoken 的薄封装；secret 由 config（环境变量）提供，启动时已 fail-fast 校验非空 */
@Injectable()
export class JwtService {
  sign(payload: { sub: string; role: string }): string {
    // jsonwebtoken 的 SignOptions.expiresIn 收窄为 ms 的 StringValue，这里断言对齐（运行时接受 "7d"）
    const expiresIn = config.jwtExpiresIn as jwt.SignOptions["expiresIn"];
    return jwt.sign(payload, config.jwtSecret, { expiresIn });
  }
  verify(token: string): { sub: string; role: string } {
    return jwt.verify(token, config.jwtSecret) as { sub: string; role: string };
  }
}
