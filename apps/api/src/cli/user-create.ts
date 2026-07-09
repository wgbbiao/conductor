/**
 * CLI: 创建/更新用户（不提供注册界面，第一个用户靠此命令）。
 * 用法: pnpm user:create <email> <password> <displayName> [role=admin]
 * 依赖运行环境提供 DATABASE_URL（通过 .env 或外部 env）。
 */
// Node 20.6+：尝试加载 .env（cwd 可能在根或 apps/api）
for (const p of [".env", "../../.env"]) {
  try {
    process.loadEnvFile(p);
    break;
  } catch {
    // 尝试下一个路径
  }
}

import { PrismaClient } from "@conductor/db";
import * as bcrypt from "bcrypt";

type Role = "admin" | "member";

function parseRole(raw: string | undefined): Role {
  return raw === "member" ? "member" : "admin";
}

async function main(): Promise<void> {
  const [email, password, displayName, roleRaw] = process.argv.slice(2);
  if (!email || !password || !displayName) {
    console.error("用法: pnpm user:create <email> <password> <displayName> [role=admin]");
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const role = parseRole(roleRaw);
    const user = await prisma.user.upsert({
      where: { email },
      create: { email, passwordHash, displayName, role },
      update: { passwordHash, displayName, role },
    });
    const { passwordHash: _omit, ...safe } = user;
    console.log(JSON.stringify(safe, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error("user:create 失败:", err);
  process.exit(1);
});
