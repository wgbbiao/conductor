import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /** 按 id 查用户，返回不含 passwordHash */
  async getById(id: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id } });
    const { passwordHash: _omit, ...safe } = user;
    return safe;
  }
}
