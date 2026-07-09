# Phase 1 后端核心闭环 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## 修订记录

| 版本 | 日期 | 变更 | 来源 |
|------|------|------|------|
| v1.0 | 2026-07-09 | 初版 11 任务 TDD 计划 | codex 复核后起草 |
| **v1.1** | 2026-07-09 | **office-hours 评审修订**：①范围重切，对齐"开源冷启动 demo"目标（新增 Task 4a/8a/11a）；②修复技术硬伤（AuditService 签名、入队顺序、socket.io 统一）；③WorkItem 加 `type` 字段；④Handoff 实际驱动（REST + demo）；⑤明确执行批次与"开发工程师按 Task 批次审批"流程 | [评审报告](../../) · grill 共识 |

**v1.1 修订原因**：初版计划产出的是"可审计事件账本引擎"，但项目目标是开源冷启动，第一版必须是**能 demo 多角色人机协同一段研发流程**的产物。两者错配，故重切范围——不是推翻，是把服务 demo 的部分前置，补 3 个 demo 必需任务，修 4 个会编译失败/违背 ADR 的硬伤。详见各 Task 的 `【v1.1】` 标注。

**Goal:** 打通 Conductor 核心闭环——创建 WorkItem(type=bug) → 触发 ToolRun → MockToolProvider 流式产出 ToolEvent → 事件落库（PG 事实源）→ 状态流转到 review → **人类 Reviewer 在 UI 审批** → 流转到 done → 全程可审计回放。

**Architecture:** 全 TypeScript Monorepo（Turborepo + pnpm）。`packages/core` 纯类型契约（无 IO）、`packages/db` Prisma、`packages/shared` 工具、`apps/api` NestJS（REST + WebSocket + 内嵌 Engine + BullMQ worker）。PostgreSQL 为唯一事实源，Redis/BullMQ/WS 仅做执行与投递。

**Tech Stack:** Node.js 20 · pnpm 9 · TypeScript 5 (strict) · NestJS 10 · Prisma 5 · PostgreSQL 16 · Redis 7 · BullMQ · vitest · **socket.io**（见下方"实时栈统一"）

> 【v1.1】**Demo 验收标准（Phase 1 完成的硬指标）**：一个外部贡献者 clone 下来，`docker compose up -d` + `pnpm install` + `pnpm dev`，打开 Web UI——**报一个 bug → 看到 AI(Mock) 自动产出修复 → 他以 Reviewer 身份点"批准" → bug 流转到 done，且他能在审计面板回放全过程**。这 30 秒就是第一版的 whoa，也是 README 该放的 GIF。**任何不为这个 demo 服务的部分，本 Phase 不做。**

---

## Global Constraints

- **Node ≥ 20.10**，**pnpm ≥ 9.0**（根 `package.json` 的 `engines` 锁定）
- TypeScript **`strict: true`**，禁止 `any`（必要时用 `unknown` + 收窄）
- **PostgreSQL 是唯一事实源**：所有状态变更与事件必须在同一 DB 事务内写入；Redis/BullMQ/WS 不得承载真实状态
- **ToolRun 必须带 `idempotencyKey`**，重复提交返回已有结果而非新建
- **Phase 1 默认 `MockToolProvider`**；`CodexProvider` 由 `FEATURE_CODEX_PROVIDER` 环境变量门控，默认 `false`
- **Phase 1 不执行任意 skill 脚本**，SkillPack 仅解析 manifest
- 所有 CLI spawn（后续 CodexProvider）必须具备：`timeout` / `cancel` / workspace 隔离 / 命令 allowlist / 敏感环境变量过滤（本计划仅 Mock，但契约预留）
- 测试框架：**vitest**；命名 `*.spec.ts`（单元）/ `*.e2e-spec.ts`（端到端）
- 每个任务结束 **commit**，遵循 Conventional Commits（`feat:` / `test:` / `chore:` / `refactor:`）
- 代码注释与文档用中文，标识符用英文
- 【v1.1】**实时栈统一为 socket.io**：ADR-0001 原写 "WebSocket（ws）"，实际依赖与代码用 socket.io（`@nestjs/platform-socket.io` + `socket.io-client`）。二者不是一回事。本计划统一用 socket.io；**ADR-0001 需同步修订**（见"文档同步"）。禁止混用裸 `ws`。
- 【v1.1】**禁止 `as any` 绕过类型**（原 v1 的 `AuditService.record` 用了 `as any`，违背本条与"禁止 any"约束，已修正——见 Task 6）。
- 【v1.1】**BullMQ 入队必须在 DB 事务提交之后**（原 v1 在 `$transaction` 内 `queue.add`，违背 ADR-0002"状态先落库再驱动执行"的字面顺序，可能 worker 提前消费查不到行——已修正，见 Task 8）。

### 【v1.1】执行批次与审批流程（开发工程师授权）

代码开发实行**按 Task 批次审批**：每批次打包为一个 PR，**开发工程师审过才继续下一批**。AI agent 在每批次开工前，先列出本批次文件清单 + 关键设计点，获批后才动手写代码。文档改动不在此约束内。

| 批次 | Task | 审批重点 |
|------|------|----------|
| PR-1 | Task 1, 2 | 基建能否跑起来（`pnpm install` + docker 起 pg/redis） |
| PR-2 | Task 3, 5 | 核心契约 + 状态机规则（纯类型，最该让开发工程师看） |
| PR-3 | Task 4, 4a | schema + `type` 字段（数据模型，影响深远） |
| PR-4 | Task 6, 7 | api 骨架 + Mock（含 AuditService 签名修正） |
| PR-5 | Task 8, 8a, 9 | worker（入队顺序修正）+ Handoff REST + controllers |
| PR-6 | Task 10, 11, 11a | WS + e2e + **demo 脚本（跑通即验收）** |

---

## File Structure

```
conductor/
├── package.json                      # 根：workspace + scripts + engines
├── pnpm-workspace.yaml               # workspace 声明
├── turbo.json                        # 任务编排
├── tsconfig.base.json                # 共享 TS 配置
├── .env.example                      # 环境变量模板
├── .gitignore                        # 已存在
├── docker-compose.yml                # postgres + redis
├── packages/
│   ├── shared/                       # 纯工具，零依赖
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vitest.config.ts
│   │   └── src/
│   │       ├── index.ts
│   │       ├── ids.ts                # id 生成（nanoid）
│   │       ├── result.ts             # Result<T,E> 类型
│   │       └── __tests__/ids.spec.ts
│   ├── core/                         # 领域类型 + 扩展点契约，纯类型零 IO
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vitest.config.ts
│   │   └── src/
│   │       ├── index.ts
│   │       ├── domain/
│   │       │   ├── work-item.ts      # WorkItem + WorkItemStatus
│   │       │   ├── tool-run.ts       # ToolRun + ToolRunStatus + ToolError
│   │       │   └── workflow.ts       # WorkflowDefinition/WorkflowRun/Transition
│   │       ├── tools/
│   │       │   ├── tool-event.ts     # ToolEvent 联合类型
│   │       │   ├── tool-provider.ts  # ToolProvider/ToolInvocation/Context
│   │       │   └── tool-registry.ts  # ToolRegistry 接口
│   │       ├── skills/skill-pack.ts  # SkillPackLoader/Manifest
│   │       └── policy/policy.ts      # RoleDefinition/PolicyEngine（Phase1 占位）
│   └── db/                           # Prisma schema + client
│       ├── package.json
│       ├── tsconfig.json
│       └── prisma/
│           └── schema.prisma
└── apps/
    └── api/                          # NestJS
        ├── package.json
        ├── tsconfig.json
        ├── nest-cli.json
        ├── vitest.config.ts
        ├── src/
        │   ├── main.ts
        │   ├── app.module.ts
        │   ├── tools/
        │   │   ├── mock-tool-provider.ts
        │   │   ├── codex-tool-provider.ts   # feature-flagged，Phase1 仅骨架
        │   │   └── tool-registry.service.ts
        │   ├── engine/
        │   │   ├── work-item-state-machine.ts
        │   │   ├── work-item-state-machine.spec.ts
        │   │   ├── tool-run.service.ts      # 幂等 + 生命周期
        │   │   └── tool-run.worker.ts       # BullMQ worker
        │   ├── modules/
        │   │   ├── work-items/
        │   │   │   ├── work-items.controller.ts
        │   │   │   ├── work-items.service.ts
        │   │   │   └── dto.ts
        │   │   └── tool-runs/
        │   │       ├── tool-runs.controller.ts
        │   │       ├── tool-runs.service.ts
        │   │       └── dto.ts
        │   ├── events/
        │   │   ├── audit.service.ts         # AuditEvent 写入
        │   │   └── events.gateway.ts        # WebSocket
        │   └── prisma/prisma.service.ts     # PrismaClient 封装
        └── test/
            └── smoke.e2e-spec.ts
```

**职责边界**
- `packages/core`：**零运行时依赖、零 IO**。只有类型与纯函数（状态机转移规则）。任何 import `@prisma/client`/`@nestjs/*` 都违反边界。
- `packages/db`：仅暴露 Prisma schema 与生成的 client。
- `apps/api`：组装一切，承载 IO（DB/Redis/WS）与框架。
- 状态机转移规则放 `packages/core`（纯函数可单测），状态机的**执行**（事务写入）放 `apps/api/engine`。

---

## Task 1: Monorepo 基建 + Docker

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `.env.example`, `docker-compose.yml`

**Interfaces:**
- Produces: 可运行的 monorepo 骨架；`pnpm install` + `pnpm dev` 不报错；`docker compose up -d` 启动 postgres/redis

- [ ] **Step 1: 创建根 `package.json`**

```json
{
  "name": "conductor",
  "private": true,
  "version": "0.0.0",
  "engines": { "node": ">=20.10", "pnpm": ">=9.0" },
  "packageManager": "pnpm@9.12.0",
  "scripts": {
    "build": "turbo run build",
    "test": "turbo run test",
    "dev": "turbo run dev",
    "lint": "turbo run lint",
    "db:generate": "pnpm --filter @conductor/db exec prisma generate",
    "db:migrate": "pnpm --filter @conductor/db exec prisma migrate dev"
  },
  "devDependencies": {
    "turbo": "^2.1.0",
    "typescript": "^5.5.4",
    "vitest": "^2.0.5"
  }
}
```

- [ ] **Step 2: 创建 `pnpm-workspace.yaml`**

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 3: 创建 `turbo.json`**

```json
{
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**"] },
    "test": { "dependsOn": ["^build"] },
    "dev": { "cache": false, "persistent": true },
    "lint": {}
  }
}
```

- [ ] **Step 4: 创建 `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "sourceMap": true,
    "outDir": "dist"
  }
}
```

- [ ] **Step 5: 创建 `.env.example`**

```bash
# 数据库
DATABASE_URL="postgresql://conductor:conductor@localhost:5432/conductor?schema=public"
# Redis
REDIS_URL="redis://localhost:6379"
# 功能开关：Phase 1 默认关闭 Codex
FEATURE_CODEX_PROVIDER=false
# API
PORT=3000
```

- [ ] **Step 6: 创建 `docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: conductor
      POSTGRES_PASSWORD: conductor
      POSTGRES_DB: conductor
    ports: ["5432:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U conductor"]
      interval: 5s
      timeout: 3s
      retries: 10
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 10
volumes:
  pgdata:
```

- [ ] **Step 7: 验证**

Run: `cp .env.example .env && docker compose up -d && pnpm install`
Expected: postgres/redis 启动且 healthcheck 通过；`pnpm install` 成功（暂无子包，但 workspace 正常）

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: monorepo scaffolding (pnpm + turbo + tsconfig) and docker compose"
```

---

## Task 2: packages/shared（ids + Result）

**Files:**
- Create: `packages/shared/package.json`, `tsconfig.json`, `vitest.config.ts`, `src/ids.ts`, `src/result.ts`, `src/index.ts`, `src/__tests__/ids.spec.ts`

**Interfaces:**
- Produces: `@conductor/shared` 包，导出 `newId(prefix)`, `Result<T,E>`, `ok()`, `err()`

- [ ] **Step 1: 创建 `packages/shared/package.json`**

```json
{
  "name": "@conductor/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "lint": "tsc --noEmit"
  },
  "dependencies": { "nanoid": "^5.0.7" },
  "devDependencies": { "typescript": "^5.5.4", "vitest": "^2.0.5" }
}
```

- [ ] **Step 2: 创建 `packages/shared/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src"]
}
```

- [ ] **Step 3: 创建 `packages/shared/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { environment: "node", include: ["src/**/*.spec.ts"] },
});
```

- [ ] **Step 4: 写失败测试 `src/__tests__/ids.spec.ts`**

```ts
import { describe, it, expect } from "vitest";
import { newId } from "../ids";

describe("newId", () => {
  it("带前缀且全局唯一", () => {
    const a = newId("wi"); // work-item
    const b = newId("wi");
    expect(a).toMatch(/^wi_[A-Za-z0-9_-]{16,}$/);
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 5: 运行测试，确认失败**

Run: `pnpm --filter @conductor/shared test`
Expected: FAIL — `newId` 未定义 / 模块找不到

- [ ] **Step 6: 实现 `src/ids.ts`**

```ts
import { customAlphabet } from "nanoid";

// 去掉易混字符，URL 安全
const generator = customAlphabet("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz", 21);

/** 生成带前缀的唯一 id，如 newId("wi") -> "wi_xYz..." */
export function newId(prefix: string): string {
  return `${prefix}_${generator()}`;
}
```

- [ ] **Step 7: 实现 `src/result.ts`**

```ts
export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });
```

- [ ] **Step 8: 实现 `src/index.ts`**

```ts
export * from "./ids";
export * from "./result";
```

- [ ] **Step 9: 运行测试，确认通过**

Run: `pnpm --filter @conductor/shared test`
Expected: PASS (1 test)

- [ ] **Step 10: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): id generator and Result type"
```

---

## Task 3: packages/core 领域类型 + 三扩展点契约

> 纯类型包，零 IO。这是 Conductor 的核心契约资产。

**Files:**
- Create: `packages/core/package.json`, `tsconfig.json`, `vitest.config.ts`，及 `src/` 下 domain / tools / skills / policy 各文件

**Interfaces:**
- Consumes: `@conductor/shared`（`Result`）
- Produces: `@conductor/core` 导出全部领域类型与 `ToolProvider` / `SkillPackLoader` / `PolicyEngine` 契约（签名见各文件）

- [ ] **Step 1: 创建 `packages/core/package.json`**（与 shared 同构，依赖加 `@conductor/shared`）

```json
{
  "name": "@conductor/core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": { "build": "tsc -p tsconfig.json", "test": "vitest run", "lint": "tsc --noEmit" },
  "dependencies": { "@conductor/shared": "workspace:*" },
  "devDependencies": { "typescript": "^5.5.4", "vitest": "^2.0.5" }
}
```

`tsconfig.json`、`vitest.config.ts` 与 Task 2 的 shared 完全相同（复制即可）。

- [ ] **Step 2: 领域类型 `src/domain/work-item.ts`**

> 【v1.1】新增 `WorkItemType`。grill 结论：bug 不作为独立实体（那是建模洁癖，会让 Phase 1 多扛一整套状态机），而是 WorkItem 的一种。`type` 字段为后续"不同类型走不同流程"留口——这本身就是编排平台的核心能力。

```ts
export type WorkItemType = "bug" | "feature" | "task";

export type WorkItemStatus =
  | "draft"
  | "ready"      // 就绪，可触发 ToolRun
  | "running"    // 有进行中的 ToolRun
  | "review"     // 等待人工 Handoff/审批
  | "done"
  | "failed";

export interface WorkItem {
  id: string;            // wi_xxx
  projectId: string;
  type: WorkItemType;    // 【v1.1】bug/feature/task
  title: string;
  description: string;
  status: WorkItemStatus;
  currentToolRunId: string | null;
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 3: 领域类型 `src/domain/tool-run.ts`**

```ts
export type ToolRunStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "canceled";

export interface ToolError {
  code: string;
  message: string;
  /** 是否可重试 */
  retryable: boolean;
}

export interface ToolRun {
  id: string;              // tr_xxx
  workItemId: string;
  providerId: string;      // 如 "mock" / "codex"
  status: ToolRunStatus;
  idempotencyKey: string;
  prompt: string;
  exitCode: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}
```

- [ ] **Step 4: 领域类型 `src/domain/workflow.ts`**

```ts
import type { WorkItemStatus } from "./work-item";

/** 流程定义：合法的状态转移（Phase 1 内置一份默认） */
export interface WorkflowDefinition {
  id: string;
  name: string;
  transitions: WorkflowTransition[];
}

export interface WorkflowTransition {
  from: WorkItemStatus;
  to: WorkItemStatus;
  /** 是否需要人工审批才能完成此次转移 */
  requiresApproval: boolean;
}

/** 一次执行实例（Phase 1 与 WorkItem 1:1，但保留概念分离以便后续分支/重跑） */
export interface WorkflowRun {
  id: string;
  workItemId: string;
  workflowDefinitionId: string;
  currentStatus: WorkItemStatus;
  createdAt: string;
}
```

- [ ] **Step 5: 扩展点 `src/tools/tool-event.ts`**

```ts
export interface ToolEventBase {
  runId: string;
  seq: number;      // 单 run 内单调递增，从 0 开始
  ts: string;       // ISO 时间
}

export type ToolEvent =
  | (ToolEventBase & { type: "started" })
  | (ToolEventBase & { type: "output"; stream: "stdout" | "stderr"; text: string })
  | (ToolEventBase & { type: "artifact"; artifactId: string; path?: string })
  | (ToolEventBase & { type: "completed"; exitCode: number })
  | (ToolEventBase & { type: "failed"; error: import("../domain/tool-run").ToolError });
```

- [ ] **Step 6: 扩展点 `src/tools/tool-provider.ts`**

```ts
import type { AsyncIterable } from "../index";
import type { ToolEvent } from "./tool-event";
import type { ToolError } from "../domain/tool-run";

export interface ToolCapabilities {
  streaming: boolean;
  cancelable: boolean;
  /** 声明支持的命令/能力（用于 allowlist） */
  capabilities: string[];
}

export interface ToolInvocation {
  workItemId: string;
  toolRunId: string;
  prompt: string;
  workspacePath: string;
  timeoutMs?: number;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}

export interface ToolExecutionContext {
  /** 请求取消时调用 */
  signal: AbortSignal;
  logger?: { info: (m: string) => void; error: (m: string, e?: unknown) => void };
}

export type ValidationResult =
  | { valid: true }
  | { valid: false; error: ToolError };

/** AI 工具适配契约 —— Conductor 的核心扩展点之一 */
export interface ToolProvider {
  readonly id: string;
  readonly displayName: string;
  capabilities(): Promise<ToolCapabilities>;
  validate(input: ToolInvocation): Promise<ValidationResult>;
  execute(input: ToolInvocation, ctx: ToolExecutionContext): AsyncIterable<ToolEvent>;
  cancel?(runId: string, reason?: string): Promise<void>;
}
```

> 注：`AsyncIterable` 直接用 TS 内置类型；上面 `import type { AsyncIterable }` 是占位说明，实际写 `execute(...): AsyncIterable<ToolEvent>` 即可，删除那行无用 import。

- [ ] **Step 7: 扩展点 `src/tools/tool-registry.ts`**

```ts
import type { ToolProvider } from "./tool-provider";

export interface ToolRegistry {
  register(provider: ToolProvider): void;
  get(id: string): ToolProvider | undefined;
  list(): readonly ToolProvider[];
}
```

- [ ] **Step 8: 扩展点 `src/skills/skill-pack.ts`**

```ts
export type SkillPackSource =
  | { kind: "local"; path: string }
  | { kind: "git"; url: string };

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
}

export interface SkillPackManifest {
  id: string;
  name: string;
  version: string;
  sourceType: "openspec" | "superpowers" | "gstack" | "custom";
  skills: SkillDefinition[];
  workflows?: { name: string; ref: string }[];
  conflicts?: string[];
}

export interface SkillLoadContext {
  logger?: { info: (m: string) => void };
}

/** Skills 生态适配契约 —— Phase 1 仅 detect/load manifest，不执行脚本 */
export interface SkillPackLoader {
  readonly id: string;
  detect(source: SkillPackSource): Promise<boolean>;
  load(source: SkillPackSource, ctx: SkillLoadContext): Promise<SkillPackManifest>;
}
```

- [ ] **Step 9: 治理 `src/policy/policy.ts`（Phase 1 占位契约）**

```ts
import type { WorkItemStatus } from "../domain/work-item";
import type { ToolInvocation } from "../tools/tool-provider";

export type Permission = string;

export interface PolicyContext {
  userId: string;
  roleIds: string[];
}

export interface PolicyDecision {
  allow: boolean;
  reason?: string;
}

export interface ApprovalRequirement {
  approverRoleIds: string[];
}

/** 治理契约 —— Role 不与能力插件同类，Phase 1 仅定义接口、返回放行占位 */
export interface PolicyEngine {
  canTransition(ctx: PolicyContext, from: WorkItemStatus, to: WorkItemStatus): Promise<PolicyDecision>;
  canInvokeTool(ctx: PolicyContext, invocation: ToolInvocation): Promise<PolicyDecision>;
  requiresApproval(ctx: PolicyContext, from: WorkItemStatus, to: WorkItemStatus): Promise<ApprovalRequirement | null>;
}
```

- [ ] **Step 10: 创建 `src/index.ts`（统一导出）**

```ts
export * from "./domain/work-item";
export * from "./domain/tool-run";
export * from "./domain/workflow";
export * from "./tools/tool-event";
export * from "./tools/tool-provider";
export * from "./tools/tool-registry";
export * from "./skills/skill-pack";
export * from "./policy/policy";
```

- [ ] **Step 11: 类型检查（本任务无运行时测试，纯类型）**

Run: `pnpm --filter @conductor/core lint`
Expected: PASS（无类型错误）。删除 Step 6 中那行无效 `import type { AsyncIterable }`。

- [ ] **Step 12: Commit**

```bash
git add packages/core
git commit -m "feat(core): domain types and extension-point contracts (ToolProvider/SkillPack/Policy)"
```

---

## Task 4: packages/db Prisma schema + client

**Files:**
- Create: `packages/db/package.json`, `tsconfig.json`, `prisma/schema.prisma`

**Interfaces:**
- Produces: `@conductor/db` 导出 `PrismaClient`；schema 含 Project / WorkItem / WorkflowDefinition / WorkflowRun / ToolRun / ToolEvent / Artifact / Handoff / AuditEvent

- [ ] **Step 1: 创建 `packages/db/package.json`**

```json
{
  "name": "@conductor/db",
  "version": "0.0.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "lint": "tsc --noEmit",
    "migrate": "prisma migrate dev",
    "generate": "prisma generate"
  },
  "dependencies": { "@prisma/client": "^5.18.0" },
  "devDependencies": { "prisma": "^5.18.0", "typescript": "^5.5.4" }
}
```

> `db` 包不设 `type: module`（Prisma 生成 CommonJS client 更稳）。其 `tsconfig.json` 在 `tsconfig.base.json` 基础上把 `module/moduleResolution` 改为 `CommonJS`/`node`。

- [ ] **Step 2: 创建 `packages/db/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "CommonJS",
    "moduleResolution": "node",
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: 创建 `packages/db/prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Project {
  id          String   @id @default(cuid())
  name        String
  description String   @default("")
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  workItems   WorkItem[]
}

enum WorkItemStatus {
  draft
  ready
  running
  review
  done
  failed
}

enum WorkItemType {
  bug
  feature
  task
}

model WorkItem {
  id               String         @id @default(cuid())
  projectId        String
  type             WorkItemType   @default(task)   // 【v1.1】
  title            String
  description      String         @default("")
  status           WorkItemStatus @default(draft)
  currentToolRunId String?
  createdAt        DateTime       @default(now())
  updatedAt        DateTime       @updatedAt

  project          Project        @relation(fields: [projectId], references: [id])
  toolRuns         ToolRun[]
  workflowRuns     WorkflowRun[]
  handoffs         Handoff[]

  @@index([projectId])
  @@index([status])
  @@index([type])         // 【v1.1】按类型查询
}

model WorkflowDefinition {
  id        String   @id @default(cuid())
  name      String
  // transitions 以 JSON 存储（Phase 1 简化）
  definition Json
  createdAt DateTime @default(now())
  runs      WorkflowRun[]
}

model WorkflowRun {
  id                   String   @id @default(cuid())
  workItemId           String
  workflowDefinitionId String
  currentStatus        WorkItemStatus
  createdAt            DateTime @default(now())

  workItem             WorkItem @relation(fields: [workItemId], references: [id])
  definition           WorkflowDefinition @relation(fields: [workflowDefinitionId], references: [id])

  @@index([workItemId])
}

enum ToolRunStatus {
  queued
  running
  succeeded
  failed
  canceled
}

model ToolRun {
  id              String        @id @default(cuid())
  workItemId      String
  providerId      String
  status          ToolRunStatus @default(queued)
  idempotencyKey  String
  prompt          String
  exitCode        Int?
  startedAt       DateTime?
  finishedAt      DateTime?
  createdAt       DateTime      @default(now())

  workItem        WorkItem      @relation(fields: [workItemId], references: [id])
  events          ToolEvent[]

  @@unique([workItemId, idempotencyKey])   // 幂等：同 workItem 同 key 唯一
  @@index([workItemId])
  @@index([status])
}

model ToolEvent {
  id        String   @id @default(cuid())
  runId     String
  seq       Int
  type      String   // started|output|artifact|completed|failed
  payload   Json     // 完整事件体
  ts        DateTime @default(now())

  run       ToolRun  @relation(fields: [runId], references: [id], onDelete: Cascade)

  @@unique([runId, seq])     // seq 单调，防重
  @@index([runId])
}

model Artifact {
  id         String   @id @default(cuid())
  toolRunRef String
  path       String
  contentHash String?
  createdAt  DateTime @default(now())

  @@index([toolRunRef])
}

enum HandoffStatus {
  pending
  approved
  rejected
}

model Handoff {
  id          String        @id @default(cuid())
  workItemId  String
  fromStatus  WorkItemStatus
  toStatus    WorkItemStatus
  status      HandoffStatus @default(pending)
  decidedBy   String?
  decidedAt   DateTime?
  createdAt   DateTime      @default(now())

  workItem    WorkItem      @relation(fields: [workItemId], references: [id])

  @@index([workItemId])
}

model AuditEvent {
  id        String   @id @default(cuid())
  actorType String   // user | system | tool
  actorId   String
  action    String
  subjectType String
  subjectId String
  payload   Json
  createdAt DateTime @default(now())

  @@index([subjectType, subjectId])
  @@index([createdAt])
}
```

- [ ] **Step 4: 生成 client 并创建首迁移**

Run: `pnpm install && pnpm db:generate && pnpm --filter @conductor/db exec prisma migrate dev --name init`
Expected: 生成 Prisma Client；创建 `packages/db/prisma/migrations/<ts>_init/`；DB 表创建成功

- [ ] **Step 5: 创建 `packages/db/src/index.ts`（导出 client + Prisma 命名空间）**

```ts
export { PrismaClient } from "@prisma/client";
export type * from "@prisma/client";
```

- [ ] **Step 6: 类型检查**

Run: `pnpm --filter @conductor/db lint`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/db
git commit -m "feat(db): prisma schema with event ledger + idempotent tool runs"
```

---

## Task 5: core 状态机纯函数（转移规则）

> 转移规则是纯函数，放 `packages/core`（零 IO、可单测）。状态机的**执行**（事务写入）在 Task 8。

**Files:**
- Create: `packages/core/src/engine/workflow-rules.ts`, `packages/core/src/engine/workflow-rules.spec.ts`
- Modify: `packages/core/src/index.ts`（追加导出）

**Interfaces:**
- Consumes: `WorkItemStatus`, `WorkflowDefinition`, `WorkflowTransition`, `Result`
- Produces: `defaultWorkflowDefinition`, `findTransition(def, from, to)`, `canTransition(...)`, `nextStatuses(def, from)`

- [ ] **Step 1: 写失败测试 `src/engine/workflow-rules.spec.ts`**

```ts
import { describe, it, expect } from "vitest";
import { defaultWorkflowDefinition, canTransition, findTransition } from "./workflow-rules";

describe("workflow rules", () => {
  const def = defaultWorkflowDefinition;

  it("draft -> ready 合法且无需审批", () => {
    expect(canTransition(def, "draft", "ready")).toBe(true);
    expect(findTransition(def, "draft", "ready")?.requiresApproval).toBe(false);
  });

  it("ready -> running 合法", () => {
    expect(canTransition(def, "ready", "running")).toBe(true);
  });

  it("running -> review 需要审批", () => {
    expect(canTransition(def, "running", "review")).toBe(true);
    expect(findTransition(def, "running", "review")?.requiresApproval).toBe(true);
  });

  it("draft -> done 非法", () => {
    expect(canTransition(def, "draft", "done")).toBe(false);
  });

  it("running -> failed 合法", () => {
    expect(canTransition(def, "running", "failed")).toBe(true);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `pnpm --filter @conductor/core test`
Expected: FAIL — 模块不存在

- [ ] **Step 3: 实现 `src/engine/workflow-rules.ts`**

```ts
import type { WorkflowDefinition, WorkflowTransition } from "../domain/workflow";
import type { WorkItemStatus } from "../domain/work-item";

/** Phase 1 内置默认流程定义 */
export const defaultWorkflowDefinition: WorkflowDefinition = {
  id: "wf_default",
  name: "default",
  transitions: [
    { from: "draft", to: "ready", requiresApproval: false },
    { from: "ready", to: "running", requiresApproval: false },
    { from: "running", to: "review", requiresApproval: true },
    { from: "running", to: "failed", requiresApproval: false },
    { from: "running", to: "done", requiresApproval: false },
    { from: "review", to: "done", requiresApproval: false },
    { from: "review", to: "running", requiresApproval: false },
    { from: "failed", to: "ready", requiresApproval: false },
  ],
};

export function findTransition(
  def: WorkflowDefinition,
  from: WorkItemStatus,
  to: WorkItemStatus,
): WorkflowTransition | undefined {
  return def.transitions.find((t) => t.from === from && t.to === to);
}

export function canTransition(
  def: WorkflowDefinition,
  from: WorkItemStatus,
  to: WorkItemStatus,
): boolean {
  return findTransition(def, from, to) !== undefined;
}

export function nextStatuses(def: WorkflowDefinition, from: WorkItemStatus): WorkItemStatus[] {
  return def.transitions.filter((t) => t.from === from).map((t) => t.to);
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `pnpm --filter @conductor/core test`
Expected: PASS (5 tests)

- [ ] **Step 5: 在 `src/index.ts` 追加导出**

```ts
export * from "./engine/workflow-rules";
```

- [ ] **Step 6: Commit**

```bash
git add packages/core
git commit -m "feat(core): default workflow definition and transition rules"
```

---

## Task 6: apps/api 骨架 + Prisma + Audit

**Files:**
- Create: `apps/api/package.json`, `tsconfig.json`, `nest-cli.json`, `vitest.config.ts`, `src/main.ts`, `src/app.module.ts`, `src/prisma/prisma.service.ts`, `src/events/audit.service.ts`, `src/config.ts`

**Interfaces:**
- Consumes: `@conductor/db`(`PrismaClient`)，`@conductor/core`
- Produces: 可启动的 NestJS app（`pnpm --filter @conductor/api start:dev` 监听 :3000）；`PrismaService`、`AuditService`

- [ ] **Step 1: 创建 `apps/api/package.json`**

```json
{
  "name": "@conductor/api",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "build": "nest build",
    "start": "node dist/main.js",
    "start:dev": "nest start --watch",
    "test": "vitest run",
    "test:e2e": "vitest run --config vitest.e2e.config.ts",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "@conductor/core": "workspace:*",
    "@conductor/db": "workspace:*",
    "@conductor/shared": "workspace:*",
    "@nestjs/common": "^10.4.1",
    "@nestjs/core": "^10.4.1",
    "@nestjs/platform-express": "^10.4.1",
    "@nestjs/websockets": "^10.4.1",
    "@nestjs/platform-socket.io": "^10.4.1",
    "bullmq": "^5.12.0",
    "ioredis": "^5.4.1",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1"
  },
  "devDependencies": {
    "@nestjs/cli": "^10.4.5",
    "@types/node": "^20.14.0",
    "typescript": "^5.5.4",
    "vitest": "^2.0.5"
  }
}
```

- [ ] **Step 2: 创建 `apps/api/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "CommonJS",
    "moduleResolution": "node",
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "target": "ES2022",
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: 创建 `apps/api/nest-cli.json`**

```json
{ "collection": "@nestjs/schematics", "sourceRoot": "src" }
```

- [ ] **Step 4: 创建 `apps/api/src/config.ts`**

```ts
export const config = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: process.env.DATABASE_URL ?? "",
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  featureCodexProvider: process.env.FEATURE_CODEX_PROVIDER === "true",
};
```

- [ ] **Step 5: 创建 `src/prisma/prisma.service.ts`**

```ts
import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { PrismaClient } from "@conductor/db";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

- [ ] **Step 6: 创建 `src/events/audit.service.ts`（事实账本写入）**

> 【v1.1】**修正签名**：v1 用 `PrismaService["prisma"] extends infer P ? P : never` 是错的类型表达式，且用 `as any` 绕过类型，违背 Global Constraints。正确做法是用 Prisma 的事务客户端类型 `Prisma.TransactionClient`（由 `@prisma/client` 的 `Prisma` 命名空间导出）。注意 `record` 第一个参数显式要求事务客户端（落实 ADR-0002 的原子写入），调用方在 `$transaction` 内传入。

```ts
import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { Prisma } from "@prisma/client";

export interface AuditInput {
  actorType: "user" | "system" | "tool";
  actorId: string;
  action: string;
  subjectType: string;
  subjectId: string;
  payload?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  /** 在调用方 $transaction 内执行，传入事务客户端，保证与状态变更原子写入（落实 ADR-0002） */
  record(tx: Prisma.TransactionClient, input: AuditInput) {
    return tx.auditEvent.create({
      data: {
        actorType: input.actorType,
        actorId: input.actorId,
        action: input.action,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        payload: input.payload ?? {},
      },
    });
  }
}
```

> 说明：`Prisma.TransactionClient` 是 Prisma 生成的事务客户端类型，包含所有 model 的 `create/update/delete`，但不包含 `$transaction`/`$connect` 等——正好约束调用方必须在事务内用。无需 `as any`。

- [ ] **Step 7: 创建 `src/app.module.ts` 与 `src/main.ts`**

```ts
// src/app.module.ts
import { Module } from "@nestjs/common";
import { PrismaService } from "./prisma/prisma.service";
import { AuditService } from "./events/audit.service";

@Module({
  providers: [PrismaService, AuditService],
})
export class AppModule {}
```

```ts
// src/main.ts
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { config } from "./config";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(config.port);
  // eslint-disable-next-line no-console
  console.log(`Conductor API on :${config.port}`);
}
bootstrap();
```

- [ ] **Step 8: 验证启动**

Run: `pnpm install && pnpm --filter @conductor/api start:dev`
Expected: 编译通过，输出 `Conductor API on :3000`，无异常（需 docker pg/redis 在跑——本任务仅连 pg）

- [ ] **Step 9: Commit**

```bash
git add apps/api
git commit -m "feat(api): nest scaffold with prisma service and audit service"
```

---

## Task 7: MockToolProvider + ToolRegistry（TDD）

**Files:**
- Create: `apps/api/src/tools/mock-tool-provider.ts`, `apps/api/src/tools/mock-tool-provider.spec.ts`, `apps/api/src/tools/tool-registry.service.ts`

**Interfaces:**
- Consumes: `@conductor/core`(`ToolProvider`, `ToolEvent`, `ToolInvocation`, `ToolExecutionContext`)
- Produces: `MockToolProvider`（id=`"mock"`，流式产出 started→output→completed），`ToolRegistryService`

- [ ] **Step 1: 写失败测试 `mock-tool-provider.spec.ts`**

```ts
import { describe, it, expect } from "vitest";
import { MockToolProvider } from "./mock-tool-provider";
import type { ToolInvocation, ToolExecutionContext } from "@conductor/core";

async function collect(provider: MockToolProvider, input: ToolInvocation) {
  const ctx: ToolExecutionContext = { signal: new AbortController().signal };
  const events = [];
  for await (const e of provider.execute(input, ctx)) events.push(e);
  return events;
}

describe("MockToolProvider", () => {
  const provider = new MockToolProvider();
  const base: ToolInvocation = {
    workItemId: "wi_1", toolRunId: "tr_1", prompt: "hello",
    workspacePath: "/tmp/ws", idempotencyKey: "k1",
  };

  it("id 与 displayName", () => {
    expect(provider.id).toBe("mock");
    expect(provider.displayName).toBe("Mock Provider");
  });

  it("validate 通过", async () => {
    const r = await provider.validate(base);
    expect(r.valid).toBe(true);
  });

  it("产出 started -> output* -> completed，seq 单调", async () => {
    const events = await collect(provider, base);
    const types = events.map((e) => e.type);
    expect(types[0]).toBe("started");
    expect(types[types.length - 1]).toBe("completed");
    const seqs = events.map((e) => e.seq);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    expect(new Set(seqs).size).toBe(seqs.length); // 唯一
  });

  it("abort 后停止产出", async () => {
    const ac = new AbortController();
    const ctx: ToolExecutionContext = { signal: ac.signal };
    const iter = provider.execute(base, ctx);
    const first = await iter.next();
    expect(first.value).toBeDefined();
    ac.abort(); // 取消
    // 后续不应继续无限产出，应在合理时间内结束/抛出
    let count = 0;
    for await (const _ of iter) { count++; if (count > 1000) break; }
    expect(count).toBeLessThan(1000);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `pnpm --filter @conductor/api test`
Expected: FAIL — `MockToolProvider` 未定义

- [ ] **Step 3: 实现 `mock-tool-provider.ts`**

```ts
import { Injectable } from "@nestjs/common";
import type {
  ToolProvider, ToolInvocation, ToolExecutionContext,
  ToolEvent, ToolCapabilities, ValidationResult,
} from "@conductor/core";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 模拟 AI 工具：确定性地产出流式事件，用于稳定验证闭环链路 */
@Injectable()
export class MockToolProvider implements ToolProvider {
  readonly id = "mock";
  readonly displayName = "Mock Provider";

  async capabilities(): Promise<ToolCapabilities> {
    return { streaming: true, cancelable: true, capabilities: ["mock"] };
  }

  async validate(input: ToolInvocation): Promise<ValidationResult> {
    if (!input.prompt?.trim()) {
      return { valid: false, error: { code: "EMPTY_PROMPT", message: "prompt 不能为空", retryable: false } };
    }
    return { valid: true };
  }

  async *execute(input: ToolInvocation, ctx: ToolExecutionContext): AsyncIterable<ToolEvent> {
    let seq = 0;
    const ts = () => new Date().toISOString();
    const emit = (e: Omit<ToolEvent, "runId" | "seq" | "ts">): ToolEvent =>
      ({ ...e, runId: input.toolRunId, seq: seq++, ts: ts() } as ToolEvent);

    yield emit({ type: "started" });

    const chunks = [`[mock] 处理: ${input.prompt}`.split(" ")].flat();
    for (const word of chunks) {
      if (ctx.signal.aborted) return; // 响应取消
      await wait(5);
      yield emit({ type: "output", stream: "stdout", text: word + " " });
    }

    yield emit({ type: "completed", exitCode: 0 });
  }

  async cancel(runId: string, reason?: string): Promise<void> {
    // Mock 用 AbortSignal 取消；此处记录日志即可
    // eslint-disable-next-line no-console
    console.log(`[mock] cancel ${runId}: ${reason ?? "no reason"}`);
  }
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `pnpm --filter @conductor/api test`
Expected: PASS (4 tests)

- [ ] **Step 5: 实现 `tool-registry.service.ts`**

```ts
import { Injectable } from "@nestjs/common";
import type { ToolProvider, ToolRegistry } from "@conductor/core";

@Injectable()
export class ToolRegistryService implements ToolRegistry {
  private readonly providers = new Map<string, ToolProvider>();

  register(provider: ToolProvider): void {
    this.providers.set(provider.id, provider);
  }
  get(id: string): ToolProvider | undefined {
    return this.providers.get(id);
  }
  list(): readonly ToolProvider[] {
    return [...this.providers.values()];
  }
}
```

- [ ] **Step 6: 在 `AppModule` 注册 MockToolProvider + Registry**

```ts
import { Module } from "@nestjs/common";
import { PrismaService } from "./prisma/prisma.service";
import { AuditService } from "./events/audit.service";
import { MockToolProvider } from "./tools/mock-tool-provider";
import { ToolRegistryService } from "./tools/tool-registry.service";

@Module({
  providers: [PrismaService, AuditService, MockToolProvider, ToolRegistryService],
})
export class AppModule {
  constructor(registry: ToolRegistryService, mock: MockToolProvider) {
    registry.register(mock); // Phase 1 仅注册 mock
  }
}
```

- [ ] **Step 7: 类型检查 + 测试**

Run: `pnpm --filter @conductor/api lint && pnpm --filter @conductor/api test`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add apps/api
git commit -m "feat(api): mock tool provider with streaming events + tool registry"
```

---

## Task 8: ToolRunService + BullMQ worker（幂等 + 事件落库）

> 核心：幂等创建 → 入队 → worker 消费 → provider 流式 → ToolEvent 落库（seq 唯一）→ 状态流转（PG 事务）。

**Files:**
- Create: `apps/api/src/engine/tool-run.service.ts`, `apps/api/src/engine/tool-run.worker.ts`, `apps/api/src/engine/queues.ts`

**Interfaces:**
- Consumes: `PrismaService`, `AuditService`, `ToolRegistryService`, `@conductor/core`(`defaultWorkflowDefinition`, `canTransition`)
- Produces: `ToolRunService.start(workItemId, prompt, idempotencyKey)` → 返回 `toolRunId`（幂等）；`toolRunsQueue`（BullMQ）；worker 自动消费并发出完成事件

- [ ] **Step 1: 创建 `queues.ts`（BullMQ 队列定义）**

```ts
import { Queue, QueueEvents } from "bullmq";
import IORedis from "ioredis";
import { config } from "../config";

export const connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });

export const toolRunsQueue = new Queue("tool-runs", { connection });
export const toolRunsQueueEvents = new QueueEvents("tool-runs", { connection });
```

- [ ] **Step 2: 实现 `tool-run.service.ts`（幂等创建 + 入队）**

> 【v1.1】**修正入队顺序**：v1 在 `$transaction` 内 `await toolRunsQueue.add(...)`，违背 ADR-0002"状态先落库再驱动执行"——worker 可能在事务提交前就消费，去查 `toolRun` 查不到而抛错。**修正：事务内只写状态+事件，`queue.add` 移到事务提交后**。`audit.record` 现在接收正确的 `Prisma.TransactionClient`（Task 6 已修）。

```ts
import { Injectable, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../events/audit.service";
import { toolRunsQueue } from "./queues";
import { canTransition, defaultWorkflowDefinition } from "@conductor/core";

@Injectable()
export class ToolRunService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  /** 幂等：相同 (workItemId, idempotencyKey) 返回已有 ToolRun */
  async start(workItemId: string, prompt: string, idempotencyKey: string, providerId = "mock") {
    // 事务内：只写状态 + 事件（事实源）
    const toolRun = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.toolRun.findUnique({
        where: { workItemId_idempotencyKey: { workItemId, idempotencyKey } },
      });
      if (existing) return existing; // 幂等命中

      const workItem = await tx.workItem.findUniqueOrThrow({ where: { id: workItemId } });

      // 若 WorkItem 非 running，尝试转移 ready->running 或拒绝
      if (workItem.status !== "running") {
        if (workItem.status === "ready" && canTransition(defaultWorkflowDefinition, "ready", "running")) {
          await tx.workItem.update({ where: { id: workItemId }, data: { status: "running" } });
          await this.audit.record(tx, {
            actorType: "system", actorId: "engine", action: "transition",
            subjectType: "WorkItem", subjectId: workItemId,
            payload: { from: "ready", to: "running" },
          });
        } else {
          throw new BadRequestException(`WorkItem 状态 ${workItem.status} 不可启动 ToolRun`);
        }
      }

      const created = await tx.toolRun.create({
        data: { workItemId, providerId, idempotencyKey, prompt, status: "queued" },
      });
      await tx.workItem.update({ where: { id: workItemId }, data: { currentToolRunId: created.id } });
      await this.audit.record(tx, {
        actorType: "system", actorId: "engine", action: "tool_run.created",
        subjectType: "ToolRun", subjectId: created.id, payload: { providerId },
      });
      return created;
    });

    // 【v1.1】事务提交后再入队，保证 worker 消费时行已可见（落实 ADR-0002）
    await toolRunsQueue.add("run", { toolRunId: toolRun.id });
    return toolRun;
  }
}
```

- [ ] **Step 3: 实现 `tool-run.worker.ts`（流式消费 + 事件落库）**

```ts
import { Worker, type Job } from "bullmq";
import { connection } from "./queues";
import type { ToolEvent } from "@conductor/core";

/** 由 Nest 在 onModuleInit 时调用注入好的依赖启动 worker */
export function startToolRunWorker(deps: {
  prisma: import("../prisma/prisma.service").PrismaService;
  registry: import("../tools/tool-registry.service").ToolRegistryService;
  audit: import("../events/audit.service").AuditService;
  onEvent?: (runId: string, event: ToolEvent) => void; // 供 WS gateway 订阅
}) {
  const { prisma, registry, audit, onEvent } = deps;

  const worker = new Worker(
    "tool-runs",
    async (job: Job) => {
      const { toolRunId } = job.data as { toolRunId: string };
      const toolRun = await prisma.toolRun.findUniqueOrThrow({ where: { id: toolRunId } });
      const provider = registry.get(toolRun.providerId);
      if (!provider) throw new Error(`provider ${toolRun.providerId} 未注册`);

      await prisma.toolRun.update({
        where: { id: toolRunId },
        data: { status: "running", startedAt: new Date() },
      });

      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), (job.opts.timeout ?? 60_000));

      try {
        for await (const event of provider.execute(
          { workItemId: toolRun.workItemId, toolRunId, prompt: toolRun.prompt,
            workspacePath: `/tmp/ws/${toolRunId}`, idempotencyKey: toolRun.idempotencyKey },
          { signal: ac.signal },
        )) {
          // 落库：seq 唯一约束防重
          await prisma.toolEvent.create({
            data: { runId: toolRunId, seq: event.seq, type: event.type, payload: event as any },
          });
          onEvent?.(toolRunId, event);
        }

        await prisma.toolRun.update({
          where: { id: toolRunId },
          data: { status: "succeeded", exitCode: 0, finishedAt: new Date() },
        });
        await transitionWorkItem(prisma, audit, toolRun.workItemId, "running", "review");
      } catch (e) {
        await prisma.toolRun.update({
          where: { id: toolRunId },
          data: { status: "failed", finishedAt: new Date() },
        }).catch(() => void 0);
        await transitionWorkItem(prisma, audit, toolRun.workItemId, "running", "failed");
        throw e;
      } finally {
        clearTimeout(timer);
      }
    },
    { connection },
  );

  return worker;
}

/** WorkItem 状态流转：同事务写状态 + AuditEvent（落实 ADR-0002） */
async function transitionWorkItem(
  prisma: import("../prisma/prisma.service").PrismaService,
  audit: import("../events/audit.service").AuditService,
  workItemId: string,
  from: import("@conductor/core").WorkItemStatus,
  to: import("@conductor/core").WorkItemStatus,
) {
  await prisma.$transaction(async (tx) => {
    await tx.workItem.update({ where: { id: workItemId }, data: { status: to } });
    await audit.record(tx, {
      actorType: "system", actorId: "engine", action: "transition",
      subjectType: "WorkItem", subjectId: workItemId, payload: { from, to },
    });
  });
}
```

- [ ] **Step 4: 在 `AppModule` 启动 worker，并接入 `onEvent` 钩子**

```ts
// app.module.ts 增补
import { OnModuleInit } from "@nestjs/common";
import { ToolRunService } from "./engine/tool-run.service";
import { startToolRunWorker } from "./engine/tool-run.worker";
import { EventBusService } from "./events/event-bus.service"; // Task 9 创建

@Module({
  providers: [PrismaService, AuditService, MockToolProvider, ToolRegistryService, ToolRunService, EventBusService],
})
export class AppModule implements OnModuleInit {
  private worker?: import("bullmq").Worker;
  constructor(
    registry: ToolRegistryService,
    mock: MockToolProvider,
    private prisma: PrismaService,
    private audit: AuditService,
    private bus: EventBusService,
  ) {
    registry.register(mock);
  }

  async onModuleInit() {
    this.worker = startToolRunWorker({
      prisma: this.prisma,
      registry: this.registry, // 注入 ToolRegistryService（补到构造参数）
      audit: this.audit,
      onEvent: (runId, event) => this.bus.emit(runId, event),
    });
  }

  async onModuleDestroy() { await this.worker?.close(); }
}
```

> 注意：把 `ToolRegistryService` 也注入到构造函数（上面 `this.registry`）。`EventBusService` 见 Task 9。

- [ ] **Step 5: 手动验证（需 pg + redis 运行）**

Run: 启动 api → 用后续 Task 9 的 API 触发；本步先 `pnpm --filter @conductor/api lint`
Expected: 类型通过

- [ ] **Step 6: Commit**

```bash
git add apps/api
git commit -m "feat(engine): idempotent tool-run service and bullmq worker with event ledger"
```

---

## Task 8a: 【v1.1 新增】Handoff 审批 REST —— demo 的 whoa 核心

> **为什么新增**：demo 的 whoa 点是"人以 Reviewer 身份在 UI 点批准，流程才继续流转，全程可审计"。初版计划建了 Handoff 表（Task 4）但完全不驱动（Self-Review 自己承认 out-of-scope）。没有这个 Task，demo 只能演"AI 自己跑完"，丢掉你要的"人机协同"。本 Task 是 Phase 1 的 demo 验收关键。

**Files:**
- Create: `apps/api/src/modules/handoffs/handoffs.service.ts`, `handoffs.controller.ts`, `dto.ts`
- Modify: `app.module.ts`（注册）

**Interfaces:**
- Consumes: `PrismaService`, `AuditService`, `@conductor/core`(`canTransition`, `defaultWorkflowDefinition`)
- Produces:
  - `POST /work-items/:id/handoffs/pending` → 返回当前 pending Handoff（若有）
  - `POST /handoffs/:id/approve` → WorkItem `review → done`（事务内：状态转移 + Handoff 更新 + AuditEvent）
  - `POST /handoffs/:id/reject` → WorkItem `review → running`（打回，重新触发）

- [ ] **Step 1: 创建 `modules/handoffs/dto.ts`**

> Phase 1 不接真 auth，`decidedBy` 由请求体传（demo 时代表"我是 Reviewer"）。后续接 User/JWT 后改从 token 取。

```ts
export class DecideHandoffDto {
  decidedBy!: string;   // reviewer 的标识（Phase 1 占位，demo 用）
  reason?: string;
}
```

- [ ] **Step 2: 实现 `handoffs.service.ts`（事务内原子：状态 + Handoff + Audit）**

```ts
import { Injectable, NotFoundException, ConflictException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../events/audit.service";
import { canTransition, defaultWorkflowDefinition } from "@conductor/core";

@Injectable()
export class HandoffsService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  /** 取某 WorkItem 当前 pending 的 Handoff（review 等待审批时存在） */
  findPending(workItemId: string) {
    return this.prisma.handoff.findFirst({
      where: { workItemId, status: "pending" },
      orderBy: { createdAt: "desc" },
    });
  }

  /** 批准：review → done */
  async approve(handoffId: string, decidedBy: string, reason?: string) {
    return this.decide(handoffId, "approved", "done", decidedBy, reason);
  }

  /** 打回：review → running（重新进入 AI 处理） */
  async reject(handoffId: string, decidedBy: string, reason?: string) {
    return this.decide(handoffId, "rejected", "running", decidedBy, reason);
  }

  /** 落实 ADR-0002：状态转移 + Handoff 决议 + AuditEvent 同事务原子写入 */
  private async decide(
    handoffId: string,
    handoffStatus: "approved" | "rejected",
    toStatus: "done" | "running",
    decidedBy: string,
    reason?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const handoff = await tx.handoff.findUniqueOrThrow({ where: { id: handoffId } });
      if (handoff.status !== "pending") {
        throw new ConflictException(`Handoff 已决议为 ${handoff.status}`);
      }

      // 校验转移合法性（纯函数，来自 packages/core）
      if (!canTransition(defaultWorkflowDefinition, handoff.fromStatus, handoff.toStatus)) {
        throw new ConflictException(`非法转移 ${handoff.fromStatus} -> ${handoff.toStatus}`);
      }

      await tx.handoff.update({
        where: { id: handoffId },
        data: { status: handoffStatus, decidedBy, decidedAt: new Date() },
      });
      await tx.workItem.update({
        where: { id: handoff.workItemId },
        data: { status: toStatus },
      });
      await this.audit.record(tx, {
        actorType: "user", actorId: decidedBy,
        action: `handoff.${handoffStatus}`,
        subjectType: "WorkItem", subjectId: handoff.workItemId,
        payload: { handoffId, to: toStatus, reason },
      });
      return tx.workItem.findUniqueOrThrow({ where: { id: handoff.workItemId } });
    });
  }
}
```

- [ ] **Step 3: 实现 `handoffs.controller.ts`**

```ts
import { Controller, Post, Param, Body, NotFoundException } from "@nestjs/common";
import { HandoffsService } from "./handoffs.service";
import { DecideHandoffDto } from "./dto";

@Controller()
export class HandoffsController {
  constructor(private handoffs: HandoffsService) {}

  @Get("work-items/:id/handoffs/pending")
  async pending(@Param("id") id: string) {
    const h = await this.handoffs.findPending(id);
    if (!h) throw new NotFoundException("无 pending Handoff");
    return h;
  }

  @Post("handoffs/:id/approve")
  approve(@Param("id") id: string, @Body() dto: DecideHandoffDto) {
    return this.handoffs.approve(id, dto.decidedBy, dto.reason);
  }

  @Post("handoffs/:id/reject")
  reject(@Param("id") id: string, @Body() dto: DecideHandoffDto) {
    return this.handoffs.reject(id, dto.decidedBy, dto.reason);
  }
}
```

> 注意：需补 `Get` 的 import（`import { Controller, Post, Get, Param, Body, NotFoundException } from "@nestjs/common";`）。

- [ ] **Step 4: 在 worker 的 `running → review` 转移处，创建 pending Handoff**

> 【v1.1】这是闭环关键：ToolRun 成功后，worker 不只转移状态到 review，还要**创建一条 pending Handoff 记录**，否则审批接口找不到 handoff。修改 Task 8 Step 3 的 `transitionWorkItem`：当目标是 `review` 时附带创建 Handoff。

在 Task 8 的 worker 文件追加（或改造 `transitionWorkItem`）：

```ts
/** running -> review 时附带创建 pending Handoff（demo 审批入口） */
async function transitionToReview(
  prisma: PrismaService,
  audit: AuditService,
  workItemId: string,
) {
  await prisma.$transaction(async (tx) => {
    await tx.workItem.update({ where: { id: workItemId }, data: { status: "review" } });
    await tx.handoff.create({
      data: { workItemId, fromStatus: "running", toStatus: "review", status: "pending" },
    });
    await audit.record(tx, {
      actorType: "system", actorId: "engine", action: "transition",
      subjectType: "WorkItem", subjectId: workItemId, payload: { to: "review" },
    });
  });
}
```

在 worker 成功分支把 `transitionWorkItem(..., "running", "review")` 替换为 `transitionToReview(prisma, audit, toolRun.workItemId)`。

- [ ] **Step 5: 在 `AppModule` 注册 `HandoffsController` + `HandoffsService`**

`controllers` 增加 `HandoffsController`，`providers` 增加 `HandoffsService`。

- [ ] **Step 6: 手动验证（需 pg+redis）**

Run: 走完 Task 9 的 run → 用 `GET /work-items/:id/handoffs/pending` 拿到 handoffId → `POST /handoffs/:id/approve`（body `{ "decidedBy": "reviewer-1" }`）→ `GET /work-items/:id` 应为 `done`。
Expected: WorkItem 流转到 done；AuditEvent 有 `handoff.approved` 记录。

- [ ] **Step 7: Commit**

```bash
git add apps/api
git commit -m "feat(api): handoff approval REST endpoints (approve/reject) driving the demo whoa loop"
```

---

## Task 9: EventBus + REST controllers（work-items / tool-runs）

**Files:**
- Create: `apps/api/src/events/event-bus.service.ts`, `apps/api/src/modules/work-items/*`, `apps/api/src/modules/tool-runs/*`
- Modify: `app.module.ts`（注册 controllers）

**Interfaces:**
- Produces:
  - REST: `POST /projects/:pid/work-items`、`GET /work-items`、`GET /work-items/:id`
  - `POST /work-items/:id/runs`（body: `{ prompt, idempotencyKey }`）→ 返回 ToolRun
  - `GET /work-items/:id/runs`、`GET /tool-runs/:id/events`
  - `EventBusService.on(runId)` → 订阅事件流（供 Task 10 WS gateway）

- [ ] **Step 1: 实现 `event-bus.service.ts`**

```ts
import { Injectable } from "@nestjs/common";
import { EventEmitter } from "events";
import type { ToolEvent } from "@conductor/core";

@Injectable()
export class EventBusService {
  private emitter = new EventEmitter();
  on(runId: string, cb: (e: ToolEvent) => void): () => void {
    this.emitter.on(runId, cb);
    return () => this.emitter.off(runId, cb);
  }
  emit(runId: string, event: ToolEvent): void {
    this.emitter.emit(runId, event);
  }
}
```

- [ ] **Step 2: 创建 `modules/work-items/dto.ts`**

> 【v1.1】`CreateWorkItemDto` 加 `type` 字段（默认 `task`，demo 传 `bug`）。

```ts
export class CreateWorkItemDto {
  title!: string;
  description?: string;
  type?: "bug" | "feature" | "task";   // 【v1.1】默认 task，demo 用 bug
}
export class StartRunDto {
  prompt!: string;
  idempotencyKey!: string;
}
```

- [ ] **Step 3: 实现 `modules/work-items/work-items.service.ts`**

```ts
import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class WorkItemsService {
  constructor(private prisma: PrismaService) {}

  create(projectId: string, title: string, type: "bug" | "feature" | "task" = "task", description = "") {
    return this.prisma.workItem.create({
      data: { projectId, title, type, description, status: "draft" },
    });
  }
  list(projectId?: string, type?: "bug" | "feature" | "task") {
    return this.prisma.workItem.findMany({
      where: { ...(projectId ? { projectId } : {}), ...(type ? { type } : {}) },
      orderBy: { createdAt: "desc" },
    });
  }
  get(id: string) {
    return this.prisma.workItem.findUniqueOrThrow({ where: { id } });
  }
  /** draft -> ready */
  markReady(id: string) {
    return this.prisma.workItem.update({ where: { id }, data: { status: "ready" } });
  }
}
```

- [ ] **Step 4: 实现 `modules/work-items/work-items.controller.ts`**

```ts
import { Controller, Post, Get, Param, Body } from "@nestjs/common";
import { WorkItemsService } from "./work-items.service";
import { ToolRunService } from "../../engine/tool-run.service";
import { CreateWorkItemDto, StartRunDto } from "./dto";

@Controller()
export class WorkItemsController {
  constructor(private items: WorkItemsService, private runs: ToolRunService) {}

  @Post("projects/:pid/work-items")
  create(@Param("pid") pid: string, @Body() dto: CreateWorkItemDto) {
    return this.items.create(pid, dto.title, dto.type ?? "task", dto.description);
  }

  @Get("work-items")
  list() { return this.items.list(); }

  @Get("work-items/:id")
  get(@Param("id") id: string) { return this.items.get(id); }

  @Post("work-items/:id/ready")
  ready(@Param("id") id: string) { return this.items.markReady(id); }

  @Post("work-items/:id/runs")
  async run(@Param("id") id: string, @Body() dto: StartRunDto) {
    return this.runs.start(id, dto.prompt, dto.idempotencyKey);
  }
}
```

- [ ] **Step 5: 实现 `modules/tool-runs/tool-runs.service.ts` + `controller.ts`**

```ts
// tool-runs.service.ts
import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class ToolRunsService {
  constructor(private prisma: PrismaService) {}
  listByWorkItem(workItemId: string) {
    return this.prisma.toolRun.findMany({ where: { workItemId }, orderBy: { createdAt: "desc" } });
  }
  events(runId: string) {
    return this.prisma.toolEvent.findMany({ where: { runId }, orderBy: { seq: "asc" } });
  }
}
```

```ts
// tool-runs.controller.ts
import { Controller, Get, Param } from "@nestjs/common";
import { ToolRunsService } from "./tool-runs.service";

@Controller()
export class ToolRunsController {
  constructor(private runs: ToolRunsService) {}

  @Get("work-items/:id/runs")
  list(@Param("id") id: string) { return this.runs.listByWorkItem(id); }

  @Get("tool-runs/:id/events")
  events(@Param("id") id: string) { return this.runs.events(id); }
}
```

- [ ] **Step 6: 在 `AppModule` 注册 controllers，并补注入 `ToolRegistryService`**

```ts
import { WorkItemsController } from "./modules/work-items/work-items.controller";
import { WorkItemsService } from "./modules/work-items/work-items.service";
import { ToolRunsController } from "./modules/tool-runs/tool-runs.controller";
import { ToolRunsService } from "./modules/tool-runs/tool-runs.service";

@Module({
  imports: [],
  controllers: [WorkItemsController, ToolRunsController],
  providers: [
    PrismaService, AuditService, MockToolProvider, ToolRegistryService,
    ToolRunService, EventBusService, WorkItemsService, ToolRunsService,
  ],
})
export class AppModule implements OnModuleInit { /* 同 Task 8 Step 4 */ }
```

- [ ] **Step 7: 手动验证（需 pg+redis）**

Run: `curl -X POST localhost:3000/projects/seed/work-items -H 'Content-Type: application/json' -d '{"title":"t1"}'`
Expected: 返回 `{ id: "wi...", status: "draft" }`

- [ ] **Step 8: Commit**

```bash
git add apps/api
git commit -m "feat(api): event bus and REST endpoints for work-items and tool-runs"
```

---

## Task 10: WebSocket gateway（实时事件回显）

**Files:**
- Create: `apps/api/src/events/events.gateway.ts`
- Modify: `app.module.ts`

**Interfaces:**
- Produces: WS 端点（socket.io），客户端 `emit("subscribe", runId)` → 服务端推送该 run 的 `ToolEvent`

- [ ] **Step 1: 实现 `events.gateway.ts`**

```ts
import { WebSocketGateway, WebSocketServer, SubscribeMessage, MessageHandler } from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { EventBusService } from "./event-bus.service";
import type { ToolEvent } from "@conductor/core";

@WebSocketGateway({ cors: true })
export class EventsGateway {
  @WebSocketServer() server!: Server;
  private unsubs = new Map<string, (() => void)[]>();

  constructor(private bus: EventBusService) {}

  @SubscribeMessage("subscribe")
  handleSubscribe(client: Socket, payload: { runId: string }) {
    const { runId } = payload;
    const unsub = this.bus.on(runId, (event: ToolEvent) => {
      client.emit(`tool-event:${runId}`, event);
    });
    this.unsubs.set(client.id, [...(this.unsubs.get(client.id) ?? []), unsub]);
    return { ok: true, runId };
  }

  handleDisconnect(client: Socket) {
    for (const unsub of this.unsubs.get(client.id) ?? []) unsub();
    this.unsubs.delete(client.id);
  }
}
```

- [ ] **Step 2: 在 `AppModule` 注册 gateway**

```ts
import { EventsGateway } from "./events/events.gateway";
// providers 增加 EventsGateway；并确保使用了 platform-socket.io（main.ts 中 NestFactory 默认兼容）
```

- [ ] **Step 3: 验证（手动，配合 Task 11 的 e2e）**

Run: 启动 api，后续 e2e 会连接 WS 验证。

- [ ] **Step 4: Commit**

```bash
git add apps/api
git commit -m "feat(api): websocket gateway for live tool-event streaming"
```

---

## Task 11: 端到端 smoke 测试

**Files:**
- Create: `apps/api/vitest.e2e.config.ts`, `apps/api/test/smoke.e2e-spec.ts`

**Interfaces:**
- Produces: 一个完整闭环验证：建 Project/WorkItem → ready → run(Mock) → 收 WS 事件 → 校验 ToolEvent 落库 + WorkItem 最终为 `review`

- [ ] **Step 1: 创建 `vitest.e2e.config.ts`**

```ts
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { environment: "node", include: ["test/**/*.e2e-spec.ts"], testTimeout: 30000 },
});
```

- [ ] **Step 2: 实现 `test/smoke.e2e-spec.ts`**

> 【v1.1】清理 v1 的占位垃圾代码（先 `runId: "PENDING"` 订阅再废弃），补 `afterAll` import；并把验证扩展为**含 Handoff 审批的完整 demo 闭环**（报 bug → AI 修 → 人审批 → done）。

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NestFactory } from "@nestjs/core";
import { io as ioc } from "socket.io-client";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";

describe("闭环 smoke（报 bug → AI 修 → 人审批 → done）", () => {
  let app: Awaited<ReturnType<typeof NestFactory.create>>;
  let prisma: PrismaService;
  let baseURL: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://conductor:conductor@localhost:5432/conductor?schema=public";
    process.env.REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
    app = await NestFactory.create(AppModule);
    await app.listen(0); // 随机端口
    const port = (app.getHttpServer().address() as { port: number }).port;
    baseURL = `http://localhost:${port}`;
    prisma = app.get(PrismaService);
  });
  afterAll(async () => { await app?.close(); });

  it("bug 跑通 Mock 闭环 + 人工审批，全程落库", async () => {
    const project = await prisma.project.create({ data: { name: "p1" } });

    // 1. 报一个 bug（type=bug）
    const wiRes = await fetch(`${baseURL}/projects/${project.id}/work-items`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "登录白屏", type: "bug", description: "cookie 过期后 401" }),
    });
    const wi = await wiRes.json();
    expect(wi.status).toBe("draft");
    expect(wi.type).toBe("bug"); // 【v1.1】

    // 2. ready
    await fetch(`${baseURL}/work-items/${wi.id}/ready`, { method: "POST" });

    // 3. 触发 AI(Mock) 修复
    const runRes = await fetch(`${baseURL}/work-items/${wi.id}/runs`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "修复登录白屏", idempotencyKey: "smoke-1" }),
    });
    const run = await runRes.json();
    expect(run.id).toBeTruthy();

    // 4. WS 订阅该 run 的事件（v1 的占位 PENDING 订阅已删除）
    const sock = ioc(baseURL);
    await new Promise<void>((r) => sock.on("connect", () => r()));
    const received: unknown[] = [];
    sock.emit("subscribe", { runId: run.id });
    sock.on(`tool-event:${run.id}`, (e: unknown) => received.push(e));

    // 5. 等 ToolRun 成功 → WorkItem 应进入 review（含 pending Handoff）
    const runFinal = await waitFor(
      () => prisma.toolRun.findUniqueOrThrow({ where: { id: run.id } }),
      (r) => r.status === "succeeded", 5000,
    );
    expect(runFinal.status).toBe("succeeded");

    const wiReview = await waitFor(
      () => prisma.workItem.findUniqueOrThrow({ where: { id: wi.id } }),
      (w) => w.status === "review", 5000,
    );
    expect(wiReview.status).toBe("review");

    // 事件落库校验
    const events = await prisma.toolEvent.findMany({ where: { runId: run.id }, orderBy: { seq: "asc" } });
    expect(events.length).toBeGreaterThan(1);
    expect(events[0]!.type).toBe("started");
    expect(events.at(-1)!.type).toBe("completed");
    expect(received.length).toBeGreaterThan(0); // WS 收到事件

    // 6. 人审批：找到 pending Handoff → approve → done（demo whoa 点）【v1.1】
    const pendingRes = await fetch(`${baseURL}/work-items/${wi.id}/handoffs/pending`);
    const handoff = await pendingRes.json();
    expect(handoff.id).toBeTruthy();

    const approveRes = await fetch(`${baseURL}/handoffs/${handoff.id}/approve`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decidedBy: "reviewer-1", reason: "修复OK" }),
    });
    const approved = await approveRes.json();
    expect(approved.status).toBe("done");

    // 7. 审计：有 handoff.approved 记录
    const audits = await prisma.auditEvent.findMany({
      where: { subjectType: "WorkItem", subjectId: wi.id, action: "handoff.approved" },
    });
    expect(audits.length).toBe(1);

    sock.close();
  }, 30000);
});

async function waitFor<T>(fn: () => Promise<T>, done: (t: T) => boolean, timeoutMs: number) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const t = await fn();
    if (done(t)) return t;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("waitFor 超时");
}
```

- [ ] **Step 3: 运行 e2e（需 docker pg + redis 在跑）**

Run: `pnpm --filter @conductor/api test:e2e`
Expected: PASS —— bug 闭环跑通：ToolEvent 落库、WS 收到事件、Handoff 审批后 WorkItem 到 `done`、有审计记录

- [ ] **Step 4: Commit**

```bash
git add apps/api
git commit -m "test(api): end-to-end bug→AI→human-approval closed loop"
```

---

## Task 11a: 【v1.1 新增】Demo 脚本 —— Phase 1 验收物

> **为什么新增**：开源冷启动，外部贡献者 clone 后必须能在 30 秒内看到 whoa。初版计划没有任何"让人跑起来演示"的入口。本 Task 产出最小 Web UI + 一键脚本，是 Phase 1 的**验收物**（对应顶部 Demo 验收标准）。

**Files:**
- Create: `apps/web/`（最小 Next.js + MUI 页面，**只够 demo，不追求完整**）
- Create: `scripts/demo.sh`（一键：docker up → migrate → seed 一个 project → dev）
- Modify: `README.md`（加 "30 秒体验" 段 + GIF 占位）

**Interfaces:**
- Produces: 一个能 demo 的最小 UI：①bug 列表 ②点"报 bug"创建 ③点"派给 AI"触发 ToolRun ④实时日志 ⑤review 时出现"批准/打回"按钮 ⑥审批后流转到 done ⑦审计回放

> 这个 UI 范围克制是关键：只做上面 7 步，不碰用户系统/权限/多项目。前端是 demo 的载体，不是产品。

- [ ] **Step 1: 最小 Next.js 骨架**（`apps/web`，App Router + MUI，复用 ADR-0001 选型）

只列关键，不铺完整代码（实现时补）：
- `app/page.tsx`：bug 列表 + 创建表单
- `app/work-items/[id]/page.tsx`：详情页 = 实时日志（socket.io-client 订阅）+ 审批按钮（review 态可见）
- 一个 `useWorkItems` / `api` 小封装调后端 REST

- [ ] **Step 2: `scripts/demo.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail
cp -n .env.example .env || true
docker compose up -d
pnpm install
pnpm db:migrate
# seed 一个默认 project（若不存在），便于 demo 直接报 bug
node -e "..." # 或用 prisma db seed
pnpm dev
```

- [ ] **Step 3: README 加"30 秒体验"段**

```markdown
## 🚀 30 秒体验

\`\`\`bash
git clone ... && cd conductor && ./scripts/demo.sh
\`\`\`

打开 http://localhost:3000 → 报一个 bug → 看 AI 自动修 → 你点"批准" → bug 流转到 done。

![demo](docs/assets/demo.gif) <!-- 录制后补 -->
```

- [ ] **Step 4: 人工验收（对齐顶部 Demo 验收标准）**

按 README 的 30 秒步骤跑一遍，确认 demo 闭环成立。**这是 Phase 1 的最终验收门**——demo 跑不起来，前面 13 个 Task 不算完成。

- [ ] **Step 5: Commit**

```bash
git add apps/web scripts/demo.sh README.md
git commit -m "feat(web): minimal demo UI + one-command demo script (Phase 1 acceptance)"
```

---

## Self-Review（计划自检）

**1. Spec 覆盖**（对照 `docs/design/phase-01-architecture.md`）
- ✅ 三扩展点契约 → Task 3
- ✅ 事件账本一等模型（AuditEvent/ToolEvent）→ Task 4 schema + Task 6/8 写入
- ✅ WorkflowDefinition/Run/WorkItem 分离 → Task 3 类型 + Task 4 schema + Task 5 规则
- ✅ PG 事实源 + 幂等 → Task 4 `@@unique([workItemId, idempotencyKey])`、Task 8 事务
- ✅ Role/PolicyEngine 占位 → Task 3 policy 契约（Phase 1 不实现 engine，仅边界）
- ✅ MockToolProvider 优先 → Task 7；CodexProvider 留 feature flag（Global Constraints 声明，本计划不实现具体逻辑，符合 Phase 1）
- ✅ 实时回显 → Task 10（socket.io，见下"实时栈"）
- ✅ 【v1.1】**Handoff 实际驱动** → Task 8a（REST approve/reject）+ Task 8 Step 4 创建 pending Handoff。**初版的 out-of-scope 缺口已补上**，现在 demo 闭环含人工审批。
- ✅ 【v1.1】**WorkItem.type** → Task 3 + Task 4，支持 bug 入口。
- ✅ 【v1.1】**Demo 验收物** → Task 11a，Phase 1 有可演示产物。

**2. 占位符扫描**：【v1.1】v1 残留的隐藏占位已全部修复：
- ~~Task 6 `record` 签名 `PrismaService["prisma"] extends infer P ? P : never` + `as any`~~ → 改为正确的 `Prisma.TransactionClient`
- ~~Task 8 `queue.add` 在事务内~~ → 移到事务提交后
- ~~Task 11 `runId: "PENDING"` 占位订阅 + `afterAll` 缺 import~~ → 已清理
- 残留需执行时补的：Task 8a Step 3 的 `Get` import、Task 8 Step 4 的 `this.registry` 注入——均在 Step 内显式标注。

**3. 类型一致性**：
- `WorkItemStatus` / `ToolRunStatus` 在 core 与 prisma enum 一致（draft/ready/running/review/done/failed 与 queued/running/succeeded/failed/canceled）✅
- 【v1.1】`WorkItemType`（bug/feature/task）core 与 prisma enum 一致 ✅
- `ToolProvider.execute` 返回 `AsyncIterable<ToolEvent>`，worker 与 mock 一致 ✅
- `ToolRegistryService` 实现 core 的 `ToolRegistry` ✅
- `startToolRun` 幂等唯一键 `workItemId_idempotencyKey` 与 schema `@@unique` 一致 ✅
- 【v1.1】`AuditService.record(tx: Prisma.TransactionClient)` 与 Task 8 `transitionWorkItem`/Task 8a `decide` 调用一致 ✅

**4. 【v1.1】实时栈一致性**：ADR-0001 写 `ws`，计划用 `socket.io`——已在 Global Constraints 标注统一为 socket.io，ADR 待同步（见 Execution Handoff）。

---

## Execution Handoff

计划（v1.1）完成并保存至 `docs/plans/2026-07-09-phase-01-backend-core.md`。

### 执行方式

1. **Subagent-Driven（推荐）** —— 每个 Task 派发独立 subagent，任务间 review，迭代快
2. **Inline Execution** —— 在当前会话用 executing-plans 批量执行 + 检查点

### 【v1.1】开发工程师授权流程（硬约束）

代码开发实行**按 Task 批次审批**，见 Global Constraints 的批次表（PR-1 ~ PR-6）。规则：
1. AI agent 每批次开工前，先列出本批次**文件清单 + 关键设计点**，等开发工程师批准。
2. 批次完成打包成一个 PR，开发工程师审 diff 通过后才继续下一批。
3. 文档改动（本 v1.1 修订即属此类）不需此授权。

### 【v1.1】待同步的文档

执行代码前，以下文档需同步修订（属文档工作，可直接做）：

| 文档 | 改动 |
|------|------|
| `docs/adr/0001-tech-stack.md` | 实时栈 `ws` → `socket.io`（与计划一致） |
| `docs/design/phase-01-architecture.md` | §3 数据流保留；§4 关键关系补充"WorkItem.type" |
| `ROADMAP.md` | Phase 1 补充"demo 验收标准"与"开发工程师批次审批"说明 |

### 建议新增 ADR（可选，执行代码前补）

- **ADR-0003**：`WorkItem.type` 字段（bug/feature/task）——记录"bug 不作独立实体"的决策与 grill 依据（建模洁癖 vs 冷启动速度的取舍）。
