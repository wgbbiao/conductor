# Phase 1 — 技术栈选型与架构骨架设计

> 状态：Draft · 负责人：Conductor Contributors
> 关联 ADR：[0001 技术栈选型](../adr/0001-tech-stack.md) · [0002 事实源与事件账本](../adr/0002-source-of-truth-and-event-ledger.md)

---

## 1. 背景与目标

Conductor 是一个 **AI 原生的软件开发流程编排平台**。Phase 1 的目标不是铺开全景骨架，而是**打通一个可验证的核心闭环**：

> 一个 WorkItem 被角色触发 → 调用 AI 工具（先 Mock，后 Codex）→ 流式记录事件 → 状态流转 → 人工接手/审批 → 全程可审计。

本设计经 codex 架构复核后修订，核心修正见 [§7 修订记录](#7-修订记录来自-codex-复核)。

## 2. 技术栈选型

详见 [ADR-0001](../adr/0001-tech-stack.md)。摘要：

| 层 | 选型 | 理由 |
|---|---|---|
| Monorepo | Turborepo + pnpm | 全栈 TS 任务编排 |
| 前端 | Next.js (App Router) + React + TS + **MUI** | App Router/SSR；MUI 为最流行开源 UI 框架 |
| 后端 | NestJS + TS | 模块化/DI，适合大型平台 |
| 数据 | Prisma + PostgreSQL + Redis | PG 为事实源；Redis 仅队列/缓存/投递 |
| 编排/任务 | BullMQ | 长任务队列、重试、并发 |
| 实时 | WebSocket（ws） | 事件实时投递 |
| AI 适配 | 自建 ToolProvider 抽象 | 可插拔 |

## 3. 架构分层

```
┌─ Presentation   Next.js + MUI (Web UI)
├─ API            NestJS (REST + WebSocket)
├─ Domain Core    领域模型 + 扩展点契约(ToolProvider/SkillPack) + PolicyEngine
├─ Engine         状态机 + BullMQ worker（Phase 1 内嵌 api，后续提取 packages/engine）
├─ Infrastructure Prisma/Postgres · Redis/BullMQ · AI 适配器 · CLI 执行沙箱
└─ Extensions     ToolProvider / SkillPack 插件
```

### 数据流（事实源在 PG，Redis/WS 仅投递）

```
User/API
  → WorkItem command
  → DB transaction: state change + AuditEvent（事实源）
  → BullMQ job（异步执行）
  → ToolProvider stream
  → persist ToolEvent / Artifact（事实源）
  → WebSocket fan-out（实时投递，非状态源）
  → human Handoff / approval
```

## 4. 核心领域模型

> 修正自初版草案：分离 Definition / Run / 业务对象；新增事件账本、Repository/Artifact、ToolRun 生命周期、审批点。

```
Organization · Project · Repository
WorkItem（业务对象） · WorkflowDefinition（定义） · WorkflowRun（执行实例）
ToolRun（queued/running/succeeded/failed/canceled） · ToolEvent（事件账本） · Artifact
SkillPack · SkillDefinition
RoleDefinition · RoleAssignment · PolicyEngine · Handoff · AuditEvent · User
```

**关键关系**
- `WorkItem` 是业务对象（一个需求/任务）。带 `type` 字段（bug/feature/task）——bug 等不作为独立实体，而是 WorkItem 的一种（见 ADR-0003，决策依据：避免为建模洁癖让 Phase 1 多扛一整套状态机）。
- `WorkflowDefinition` 是流程定义（状态/转移规则）；`WorkflowRun` 是一次执行实例（支持重跑/回滚/分支）。
- `ToolRun` 描述一次 AI 工具调用的完整生命周期；`ToolEvent` 是其流式事件账本（幂等 seq）。
- `Handoff` 表达"谁必须确认才能继续"，不仅是交接记录。**Phase 1 由 REST（approve/reject）实际驱动**，是 demo"人机协同审批"的核心。
- `AuditEvent` 是系统级事实账本，跨所有领域。

## 5. 三个扩展点契约（TypeScript 草案）

> 基于 codex 草案，Core 包为纯类型/无 IO，便于独立测试。

### 5.1 ToolProvider（能力扩展）

```ts
export interface ToolProvider {
  id: string;
  displayName: string;
  capabilities(): Promise<ToolCapabilities>;
  validate(input: ToolInvocation): Promise<ValidationResult>;
  execute(input: ToolInvocation, ctx: ToolExecutionContext): AsyncIterable<ToolEvent>;
  cancel?(runId: string, reason?: string): Promise<void>;
}

export interface ToolInvocation {
  workItemId: string;
  toolRunId: string;
  prompt: string;
  workspacePath: string;       // 执行细节，非顶级领域模型
  timeoutMs?: number;
  idempotencyKey: string;      // 幂等
  metadata?: Record<string, unknown>;
}

export type ToolEvent =
  | { type: "started";   runId: string; seq: number; ts: string }
  | { type: "output";    runId: string; seq: number; ts: string; stream: "stdout" | "stderr"; text: string }
  | { type: "artifact";  runId: string; seq: number; ts: string; artifactId: string; path?: string }
  | { type: "completed"; runId: string; seq: number; ts: string; exitCode: number }
  | { type: "failed";    runId: string; seq: number; ts: string; error: ToolError };
```

### 5.2 SkillPack（能力扩展，Phase 1 仅解析 manifest）

```ts
export interface SkillPackLoader {
  id: string;
  detect(source: SkillPackSource): Promise<boolean>;
  load(source: SkillPackSource, ctx: SkillLoadContext): Promise<SkillPackManifest>;
}

export interface SkillPackManifest {
  id: string;
  name: string;
  version: string;
  sourceType: "openspec" | "superpowers" | "gstack" | "custom";
  skills: SkillDefinition[];
  workflows?: WorkflowTemplate[];
  conflicts?: string[];
}
```

> Phase 1 **不执行任意 skill 脚本**，只解析 manifest、展示能力，最多挂一个本地 sample skill。

### 5.3 Role（治理，非能力插件）

```ts
export interface RoleDefinition {
  id: string;
  name: string;
  permissions: Permission[];
  allowedTransitions: WorkflowTransitionRule[];
  toolPolicies: ToolPolicy[];
  handoffRules: HandoffRule[];
}

export interface PolicyEngine {
  canTransition(ctx: PolicyContext, transition: WorkflowTransition): Promise<PolicyDecision>;
  canInvokeTool(ctx: PolicyContext, invocation: ToolInvocation): Promise<PolicyDecision>;
  requiresApproval(ctx: PolicyContext, action: WorkflowAction): Promise<ApprovalRequirement | null>;
}
```

> Role 与 ToolProvider/SkillPack **不同类**：后两者是能力扩展，Role 是治理/权限配置，由 PolicyEngine 驱动。Phase 1 仅做最小权限占位（定义边界，不实现完整 auth）。

## 6. Phase 1 MVP 范围与任务分解

### 范围
- ✅ 闭环：WorkItem 触发 → ToolRun → 流式 ToolEvent → 状态流转 → Handoff/审批 → 可审计
- ✅ `MockToolProvider`（优先），`CodexProvider` feature flag
- ✅ 最小状态机 + BullMQ worker + 幂等 key + 失败/取消
- ✅ WebSocket 实时事件回显
- ❌ 暂缓：完整 Organization/Iteration/Role CRUD、ClaudeCodeProvider、skills 深度解析、插件市场、热替换、跨租户权限

### 任务分解
1. **ADR 与边界**：事实源、任务模型、CLI 安全边界（见 ADR-0001/0002）
2. **Monorepo 最小骨架**：`apps/api`、`apps/web`、`packages/core`（领域+契约）、`packages/db`、`packages/shared`
3. **Prisma schema**：Project, WorkItem, WorkflowDefinition, WorkflowRun, ToolRun, ToolEvent, Artifact, Handoff, AuditEvent
4. **NestJS API**：创建 WorkItem、启动 ToolRun、查询事件、WS 订阅事件
5. **Engine**：状态机 + BullMQ worker + 幂等 + 失败/取消
6. **ToolProvider**：先 Mock 流式，再 CodexProvider feature flag
7. **Web UI**：WorkItem 列表/详情、运行按钮、实时日志、状态 badge
8. **验证**：状态机单测、ToolProvider contract test、API integration test、端到端 smoke

## 7. 修订记录（来自 codex 复核）

| 初版草案问题 | 修订 |
|---|---|
| `Workflow = WorkItem 状态机` 混淆定义/实例 | 拆为 `WorkflowDefinition` / `WorkflowRun` / `WorkItem` |
| Redis pub-sub 驱动真实状态流转 | PG 为事实源，Redis/BullMQ/WS 仅执行与投递 |
| 无事件账本 | 新增 `AuditEvent` / `ToolEvent` 为一等模型 |
| `Role` 与 Tool/Skill 并列插件 | 改为 `RoleDefinition + PolicyEngine`（治理） |
| 缺 ToolRun 生命周期 | 新增 `ToolRun`（queued/running/.../canceled）+ 幂等 key |
| 缺仓库/产物 | 新增 `Repository` / `Artifact` |
| 缺审批语义 | `Handoff` 表达"必须确认才继续" |
| 范围过大 | 砍为单一闭环 MVP，Mock 优先于 Codex |

### 我对 codex 的两处保留意见
1. **保留 `packages/core`**：ToolProvider 契约是核心差异化资产，需独立可测，不完全合并进 api。
2. **`Workspace` 降级**：作为 `ToolRun` 执行细节，不设为顶级领域模型。
