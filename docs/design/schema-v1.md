# 数据库 Schema 设计（v1）

> 状态：**Frozen**（定死）· 负责人：Conductor Contributors
> 覆盖：Phase 1 + Phase 1.5 的全部表
> 关联：[ADR-0002 事实源](../adr/0002-source-of-truth-and-event-ledger.md) · [ADR-0003 WorkItem.type](../adr/0003-work-item-type-vs-bug-entity.md) · [ADR-0004 账号模型](../adr/0004-account-model.md) · [P1 计划](../plans/2026-07-09-phase-01-backend-core.md) · [P1.5 计划](../plans/2026-07-09-phase-1.5-auth-user-rbac.md)
>
> **本文档是 P1+P1.5 表结构的唯一权威。** 代码里的 `schema.prisma` 必须与本文一致；任何变更必须先改本文并经评审。字段命名、类型、索引、约束均已定死，实施时不得自行增删。

---

## 1. 设计原则

1. **PostgreSQL 是唯一事实源**（ADR-0002）。所有状态变更与事件在同一事务内写入。
2. **Redis/BullMQ/WS 不承载真实状态**，只做执行与投递。
3. **事件账本是一等模型**：`AuditEvent`（系统级）、`ToolEvent`（单次工具调用，幂等 seq）。
4. **幂等**：`ToolRun` 用 `(workItemId, idempotencyKey)` 唯一约束保证重试安全。
5. **多用户就绪建模**（ADR-0004）：`User` 表按多人设计，即使 P1.5 单用户。
6. **ID 策略**：Prisma `cuid()`（迁移历史一致性；领域层逻辑 id 用 `wi_`/`tr_`/`usr_` 前缀是 core 类型，非 DB 主键）。
7. **软删除策略**：P1+P1.5 **不做软删除**。审计靠 `AuditEvent`，不靠 tombstone。后续若有合规需求再评估。

---

## 2. 表清单（10 张）

| # | 表 | 域 | 所属 Phase | 用途 |
|---|-----|----|-----------|------|
| 1 | `User` | 平台基础 | P1.5 | 用户（多用户就绪） |
| 2 | `Project` | 编排 | P1 | 项目容器 |
| 3 | `WorkItem` | 编排 | P1 | 工作项（bug/feature/task） |
| 4 | `WorkflowDefinition` | 编排 | P1 | 流程定义（状态转移规则） |
| 5 | `WorkflowRun` | 编排 | P1 | 流程执行实例 |
| 6 | `ToolRun` | 编排 | P1 | 一次 AI 工具调用（幂等） |
| 7 | `ToolEvent` | 编排 | P1 | ToolRun 的流式事件账本 |
| 8 | `Artifact` | 编排 | P1 | 工具产出物（占位） |
| 9 | `Handoff` | 编排 | P1 | 人机交接/审批 |
| 10 | `AuditEvent` | 平台基础 | P1 | 系统级事实账本 |

---

## 3. 关系图

```
User ──(actorId, 字符串引用)──→ AuditEvent / Handoff

Project 1──N WorkItem
WorkItem 1──N ToolRun
WorkItem 1──N WorkflowRun
WorkItem 1──N Handoff
WorkflowDefinition 1──N WorkflowRun
ToolRun 1──N ToolEvent   (onDelete: Cascade)
ToolRun 1──N Artifact    (逻辑关联，toolRunRef 字符串)
```

**引用说明**：
- `User` 与 `AuditEvent.actorId`/`Handoff.decidedBy` 是**字符串引用，不建外键**（ADR-0004：保持向前兼容；且 audit 账本要能在用户删除后仍保留记录）。
- 其余关系用 Prisma 外键 + 级联策略。

---

## 4. 表结构详表

### 4.1 `User`（P1.5）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | String | `@id @default(cuid())` | 主键 |
| `email` | String | `@unique` | 登录凭据，唯一 |
| `passwordHash` | String | — | bcrypt hash（cost ≥12），绝不存明文 |
| `displayName` | String | — | 显示名 |
| `role` | `UserRole` | `@default(admin)` | P1.5 单用户阶段默认 admin |
| `createdAt` | DateTime | `@default(now())` | — |
| `updatedAt` | DateTime | `@updatedAt` | — |

**索引**：`@@index([email])`（登录查询）

**Enum `UserRole`**：`admin | member`（完整角色矩阵留 P4）

**安全约束**（实施时强制）：
- `passwordHash` 不进 AuditEvent/payload/任何日志
- 登录失败（用户不存在 / 密码错）返回同一消息，防账号枚举
- 返回给前端的 User 对象必须剥除 `passwordHash`

---

### 4.2 `Project`（P1）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | String | `@id @default(cuid())` | 主键 |
| `name` | String | — | 项目名 |
| `description` | String | `@default("")` | 描述 |
| `createdAt` | DateTime | `@default(now())` | — |
| `updatedAt` | DateTime | `@updatedAt` | — |

**关系**：`1──N WorkItem`

> P1 无 Organization/Tenant（P4）。Project 是顶层容器。

---

### 4.3 `WorkItem`（P1）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | String | `@id @default(cuid())` | 主键 |
| `projectId` | String | FK → Project | 所属项目 |
| `type` | `WorkItemType` | `@default(task)` | bug/feature/task（ADR-0003） |
| `title` | String | — | 标题 |
| `description` | String | `@default("")` | 内容（bug 的复现步骤等暂入此） |
| `status` | `WorkItemStatus` | `@default(draft)` | 状态机当前态 |
| `currentToolRunId` | String? | — | 当前进行中的 ToolRun（非 FK，逻辑引用） |
| `createdAt` | DateTime | `@default(now())` | — |
| `updatedAt` | DateTime | `@updatedAt` | — |

**关系**：`project` (N──1 Project)、`toolRuns` (1──N)、`workflowRuns` (1──N)、`handoffs` (1──N)

**索引**：`@@index([projectId])`、`@@index([status])`、`@@index([type])`

**Enum `WorkItemType`**：`bug | feature | task`（ADR-0003：bug 是 WorkItem 的一种，非独立实体）

**Enum `WorkItemStatus`**：`draft | ready | running | review | done | failed`

**合法状态转移**（由 `packages/core` 的 `defaultWorkflowDefinition` 纯函数校验，非 DB 约束）：
```
draft → ready（无需审批）
ready → running（无需审批）
running → review（需审批，创建 pending Handoff）
running → failed
running → done
review → done（Handoff approve）
review → running（Handoff reject，打回）
failed → ready（重试）
```

---

### 4.4 `WorkflowDefinition`（P1）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | String | `@id @default(cuid())` | 主键 |
| `name` | String | — | 流程名 |
| `definition` | Json | — | 转移规则（P1 简化为 JSON 存储） |
| `createdAt` | DateTime | `@default(now())` | — |

**关系**：`runs` (1──N WorkflowRun)

> P1 内置一份 `defaultWorkflowDefinition`（见 WorkItem 转移图）。`definition` 字段存 transitions 数组的 JSON。

---

### 4.5 `WorkflowRun`（P1）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | String | `@id @default(cuid())` | 主键 |
| `workItemId` | String | FK → WorkItem | 所属工作项 |
| `workflowDefinitionId` | String | FK → WorkflowDefinition | 使用的流程定义 |
| `currentStatus` | `WorkItemStatus` | — | 执行实例当前态 |
| `createdAt` | DateTime | `@default(now())` | — |

**关系**：`workItem` (N──1)、`definition` (N──1)

**索引**：`@@index([workItemId])`

> **P1 约束**：`WorkflowRun` 与 `WorkItem` 为 **1:1**（同一 WorkItem 一条主轨迹）。**已知限制**：若未来要做 R3 可重放执行（[replay.md](./replay.md)），需扩展为 1:N。此为有意裁剪，不在 v1 schema 范围内。

---

### 4.6 `ToolRun`（P1）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | String | `@id @default(cuid())` | 主键 |
| `workItemId` | String | FK → WorkItem | 触发它的工作项 |
| `providerId` | String | — | 工具 id（"mock"/"codex"） |
| `status` | `ToolRunStatus` | `@default(queued)` | 调用生命周期 |
| `idempotencyKey` | String | — | 幂等键 |
| `prompt` | String | — | 发给工具的 prompt |
| `exitCode` | Int? | — | 退出码（成功为 0） |
| `startedAt` | DateTime? | — | 开始时间 |
| `finishedAt` | DateTime? | — | 结束时间 |
| `createdAt` | DateTime | `@default(now())` | — |

**关系**：`workItem` (N──1)、`events` (1──N ToolEvent)

**唯一约束**：`@@unique([workItemId, idempotencyKey])` ← **幂等核心**：同 WorkItem 同 key 重复提交返回已有 ToolRun，不新建

**索引**：`@@index([workItemId])`、`@@index([status])`

**Enum `ToolRunStatus`**：`queued | running | succeeded | failed | canceled`

---

### 4.7 `ToolEvent`（P1）—— 事件账本

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | String | `@id @default(cuid())` | 主键 |
| `runId` | String | FK → ToolRun (Cascade) | 所属 ToolRun |
| `seq` | Int | — | 单 run 内单调递增，从 0 开始 |
| `type` | String | — | `started|output|artifact|completed|failed` |
| `payload` | Json | — | 完整事件体（含 stream/text/exitCode/error） |
| `ts` | DateTime | `@default(now())` | 事件时间 |

**唯一约束**：`@@unique([runId, seq])` ← **防重核心**：seq 单调，重放/重试不重复落库

**索引**：`@@index([runId])`

> 这是回放（R1 时间线回放）与可审计的数据基础。`payload` 存完整事件体，使得只读回放无需其它表。

---

### 4.8 `Artifact`（P1，占位）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | String | `@id @default(cuid())` | 主键 |
| `toolRunRef` | String | — | 关联 ToolRun（字符串引用，非 FK） |
| `path` | String | — | 产物路径 |
| `contentHash` | String? | — | 内容哈希（去重/校验） |
| `createdAt` | DateTime | `@default(now())` | — |

**索引**：`@@index([toolRunRef])`

> P1 schema 建表但**读写逻辑未实现**（P2 接真实 AI 工具时做）。表先建以避免后续迁移。

---

### 4.9 `Handoff`（P1）—— 人机交接/审批

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | String | `@id @default(cuid())` | 主键 |
| `workItemId` | String | FK → WorkItem | 所属工作项 |
| `fromStatus` | `WorkItemStatus` | — | 转移前态 |
| `toStatus` | `WorkItemStatus` | — | 转移目标态 |
| `status` | `HandoffStatus` | `@default(pending)` | 审批状态 |
| `decidedBy` | String? | — | 决议人 userId（P1.5 起为真 userId；字符串引用 User） |
| `decidedAt` | DateTime? | — | 决议时间 |
| `createdAt` | DateTime | `@default(now())` | — |

**关系**：`workItem` (N──1)

**索引**：`@@index([workItemId])`

**Enum `HandoffStatus`**：`pending | approved | rejected`

> `decidedBy` 是 demo 的 whoa 点来源：人在 UI 点批准/打回，状态才流转。P1.5 后存真 userId。

---

### 4.10 `AuditEvent`（P1）—— 系统级事实账本

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | String | `@id @default(cuid())` | 主键 |
| `actorType` | String | — | `user | system | tool` |
| `actorId` | String | — | 动作发起者（P1.5 起用户动作用真 userId；系统用 "system"/"engine"） |
| `action` | String | — | 动作名（如 `transition`/`tool_run.created`/`handoff.approved`） |
| `subjectType` | String | — | 被操作对象类型（如 `WorkItem`/`ToolRun`） |
| `subjectId` | String | — | 被操作对象 id |
| `payload` | Json | — | 动作详情（含 from/to 等） |
| `createdAt` | DateTime | `@default(now())` | — |

**索引**：`@@index([subjectType, subjectId])`、`@@index([createdAt])`

> 跨所有领域的事实账本，回放 R1 与可治理的根基。`actorType=system` 的 actorId 用固定字符串（`"system"`/`"engine"`），`actorType=user` 用真 userId。

---

## 5. 完整 Prisma Schema（权威实现参考）

> 实施时 `packages/db/prisma/schema.prisma` 必须与此一致。这是定死的契约。

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ============ Enums ============

enum UserRole {
  admin
  member
}

enum WorkItemType {
  bug
  feature
  task
}

enum WorkItemStatus {
  draft
  ready
  running
  review
  done
  failed
}

enum ToolRunStatus {
  queued
  running
  succeeded
  failed
  canceled
}

enum HandoffStatus {
  pending
  approved
  rejected
}

// ============ 1. User (P1.5) ============

model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  displayName  String
  role         UserRole @default(admin)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@index([email])
}

// ============ 2. Project (P1) ============

model Project {
  id          String    @id @default(cuid())
  name        String
  description String    @default("")
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  workItems   WorkItem[]
}

// ============ 3. WorkItem (P1) ============

model WorkItem {
  id               String        @id @default(cuid())
  projectId        String
  type             WorkItemType  @default(task)
  title            String
  description      String        @default("")
  status           WorkItemStatus @default(draft)
  currentToolRunId String?
  createdAt        DateTime      @default(now())
  updatedAt        DateTime      @updatedAt

  project      Project          @relation(fields: [projectId], references: [id])
  toolRuns     ToolRun[]
  workflowRuns WorkflowRun[]
  handoffs     Handoff[]

  @@index([projectId])
  @@index([status])
  @@index([type])
}

// ============ 4. WorkflowDefinition (P1) ============

model WorkflowDefinition {
  id         String         @id @default(cuid())
  name       String
  definition Json
  createdAt  DateTime       @default(now())
  runs       WorkflowRun[]
}

// ============ 5. WorkflowRun (P1) ============

model WorkflowRun {
  id                   String           @id @default(cuid())
  workItemId           String
  workflowDefinitionId String
  currentStatus        WorkItemStatus
  createdAt            DateTime         @default(now())

  workItem   WorkItem           @relation(fields: [workItemId], references: [id])
  definition WorkflowDefinition @relation(fields: [workflowDefinitionId], references: [id])

  @@index([workItemId])
}

// ============ 6. ToolRun (P1) ============

model ToolRun {
  id             String        @id @default(cuid())
  workItemId     String
  providerId     String
  status         ToolRunStatus @default(queued)
  idempotencyKey String
  prompt         String
  exitCode       Int?
  startedAt      DateTime?
  finishedAt     DateTime?
  createdAt      DateTime      @default(now())

  workItem WorkItem    @relation(fields: [workItemId], references: [id])
  events   ToolEvent[]

  @@unique([workItemId, idempotencyKey])
  @@index([workItemId])
  @@index([status])
}

// ============ 7. ToolEvent (P1) ============

model ToolEvent {
  id      String  @id @default(cuid())
  runId   String
  seq     Int
  type    String
  payload Json
  ts      DateTime @default(now())

  run ToolRun @relation(fields: [runId], references: [id], onDelete: Cascade)

  @@unique([runId, seq])
  @@index([runId])
}

// ============ 8. Artifact (P1, 占位) ============

model Artifact {
  id          String   @id @default(cuid())
  toolRunRef  String
  path        String
  contentHash String?
  createdAt   DateTime @default(now())

  @@index([toolRunRef])
}

// ============ 9. Handoff (P1) ============

model Handoff {
  id          String        @id @default(cuid())
  workItemId  String
  fromStatus  WorkItemStatus
  toStatus    WorkItemStatus
  status      HandoffStatus @default(pending)
  decidedBy   String?
  decidedAt   DateTime?
  createdAt   DateTime      @default(now())

  workItem WorkItem @relation(fields: [workItemId], references: [id])

  @@index([workItemId])
}

// ============ 10. AuditEvent (P1) ============

model AuditEvent {
  id          String   @id @default(cuid())
  actorType   String
  actorId     String
  action      String
  subjectType String
  subjectId   String
  payload     Json
  createdAt   DateTime @default(now())

  @@index([subjectType, subjectId])
  @@index([createdAt])
}
```

---

## 6. 已知限制与未来扩展点

| 项 | 当前 | 何时扩展 |
|----|------|---------|
| `WorkflowRun : WorkItem` | 1:1 | R3 可重放执行时改 1:N（[replay.md](./replay.md)） |
| `Artifact` | 表占位，无读写 | P2 接真实 AI 工具 |
| Organization/Tenant | 无（Project 为顶层） | P4 多租户 |
| `UserRole` | 仅 admin/member | P4 完整 RBAC |
| 软删除 | 无 | 合规需求出现时评估 |
| `User` 与 Audit/Handoff | 字符串引用无 FK | 有意为之（审计不可因用户删除而断链） |
| 通知 | 无表 | P4（B8，随多角色） |

---

## 修订记录

| 日期 | 变更 |
|------|------|
| 2026-07-09 | v1 初版（Frozen）。整合 P1 + P1.5 全部 10 张表，统一字段/索引/约束/关系。定死为实施契约。来源：ADR-0002/0003/0004 + P1/P1.5 计划。 |
