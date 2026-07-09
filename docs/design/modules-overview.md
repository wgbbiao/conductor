# Conductor 功能模块全景

> 状态：Draft · 负责人：Conductor Contributors
> 关联：[ROADMAP](../../ROADMAP.md) · [Phase 1 架构](./phase-01-architecture.md) · [Phase 1 计划 v1.1](../plans/2026-07-09-phase-01-backend-core.md)
>
> 用途：这是**地图，不是执行计划**。给出系统所有功能模块的全景、状态、所属 Phase 与依赖关系，作为后续排期与架构决策的参照。每个模块的具体 Task 分解见对应 Phase 的计划文档。

---

## 图例

- ✅ 已实现/在做 · ⚠️ 仅占位或裁剪 · 🔢 规划中（对应 ROADMAP Phase）· ❓ 文档未明确（真缺口，需决策）

---

## 三大域

Conductor 的功能模块分三大域：

1. **A. 核心编排域** —— 产品的差异化所在（编排 AI 工具 × skills × 角色）
2. **B. 平台基础域** —— 让编排域能运行、可治理、可协作的底座
3. **C. 开源运营域** —— 让项目能被外部使用、贡献、扩展

---

## A. 核心编排域

| # | 模块 | 状态 | 所属 Phase | 依赖 | 说明 |
|---|------|------|-----------|------|------|
| A1 | 工作项管理（WorkItem） | ✅ | P1 | — | bug/feature/task，含 `type` 字段（见 [ADR-0003](../adr/0003-work-item-type-vs-bug-entity.md)） |
| A2 | 工作流引擎（状态机） | ✅ 部分 | P1 | A1 | `WorkflowDefinition`/`WorkflowRun` 分离；转移规则为纯函数在 `packages/core`；执行在 api |
| A3 | AI 工具适配层（ToolProvider） | ✅Mock / 🔢 | P1+P2 | B7 | P1 仅 `MockToolProvider`；Codex/Claude Code 适配在 P2；统一接口可热替换 |
| A4 | Skills 挂载机制（SkillPack） | ⚠️仅解析 / 🔢 | P1+P3 | — | P1 只读 manifest、不执行脚本；OpenSpec/Superpowers/gstack 适配在 P3 |
| A5 | 多角色协作（Role） | ⚠️占位 / 🔢 | P4 | B1,B2,B3 | `PolicyEngine`/`RoleDefinition` 接口在 `packages/core`；P1 不实现真逻辑 |
| A6 | 人机交接/审批（Handoff） | ✅ | P1 | A2,B5 | approve/reject，"谁必须确认才能继续"；demo 的 whoa 核心 |
| A7 | 全流程编排引擎 | 🔢 | P5 | A1-A6 | 端到端串联需求→设计→编码→测试→发布 |
| A8 | 产物/代码仓库（Artifact/Repository） | ⚠️schema 占位 | P2+ | B5 | 表已建，读写逻辑未做；关联 AI 产出的代码/文件 |

---

## B. 平台基础域

| # | 模块 | 状态 | 所属 Phase | 依赖 | 说明 |
|---|------|------|-----------|------|------|
| B1 | **身份认证（Auth/登录）** | ❓→近期 | P1.5 | B2 | 文档曾空白；已定调：JWT 登录，精简（不做注册/OAuth/找回密码） |
| B2 | **用户管理（User）** | ⚠️→近期 | P1.5 | — | 设计提到 `User` 概念，无 schema/CRUD；已定调：**按多用户建模**起步（见下"设计要点"） |
| B3 | **权限/访问控制（RBAC）** | ⚠️占位→近期 | P1.5+P4 | B1,B2 | `PolicyEngine` 接口在；已定调：**与登录一起做**，先搭"谁能干什么"骨架，完整 RBAC 在 P4 |
| B4 | 组织/租户（Organization） | ⚠️裁剪 / 🔢 | P4 | B2 | P1 砍了，只有 Project；多租户在 P4 |
| B5 | 审计与可观测 | ✅ | P1 | — | `AuditEvent` 事件账本，**差异化根基**；跨所有领域 |
| B6 | 实时通信 | ✅ | P1 | — | socket.io（见 [ADR-0001](../adr/0001-tech-stack.md)） |
| B7 | 任务队列/长任务 | ✅ | P1 | — | BullMQ + Redis；承载 AI 工具调用生命周期 |
| B8 | **通知系统** | ❓真遗漏 | P? | A6 | **全文未提，但"人机交接"天然需要通知人**。P1 demo 靠 UI 轮询糊弄，多角色后必须做（站内信/邮件/IM）。建议比登录更靠前 |
| B9 | Git/CI 集成 | 🔢 | P5 | A8 | ROADMAP 提"与外部系统集成"；产物落地、PR、CI 触发 |
| B10 | **回放/时间旅行** | ❓特性级缺口 | P? | B5 | README/ROADMAP 都宣传"可回放"，事件账本也为此设计，但**无"回放"模块设计**（触发方式？粒度？只读重放还是可从某点重执？）。承诺缺口，需补 |
| B11 | CLI 执行沙箱 | ⚠️契约预留 | P2+ | B7 | timeout/cancel/workspace 隔离/命令 allowlist/敏感环境变量过滤；P1 仅 Mock，契约已留 |

---

## C. 开源运营域

| # | 模块 | 状态 | 所属 Phase | 说明 |
|---|------|------|-----------|------|
| C1 | 插件/扩展市场 | 🔢 远期 | P5+ | ROADMAP 远期愿景提及 |
| C2 | SDK / 开放 API | 🔢 | P3+ | README 提及 `packages/` SDK 规划 |
| C3 | 贡献流程 | ✅ | — | `CONTRIBUTING.md` 已有；good first issue 机制 |

---

## 登录/用户/权限 设计要点（B1/B2/B3）

> 决策来源：2026-07-09 grill-me 评审。以下三点已拍板。

### B2 用户管理 —— 模型底线

**采用"多用户就绪"建模，起步精简功能**（grill 结论方案 B）：

- `User` 表从一开始按多用户建模（即使 P1.5 只有 1 个用户）。
- 理由：产品方向是多角色协作平台，"用户"迟早多人。若起步用极简单机账号，等做 P4 多角色/多租户时要重写 User 模型，连 `Handoff.decidedBy`、`AuditEvent.actorId`、`PolicyContext.userId` 全部返工。
- **精简在功能层，不在模型层**：不做注册界面、不做用户列表/CRUD UI、不做找回密码。只暴露"查当前登录用户"。

### B1 身份认证 —— 登录方案

- **JWT**（access token，可选 refresh token）。
- 不做：OAuth/SSO、注册流程、邮箱验证、找回密码。
- 登录后前端带 JWT 调 REST；WebSocket 鉴权在连接时校验 token。

### B3 权限 —— 与登录一起做骨架

- 已有 `PolicyEngine` 接口（`canTransition`/`canInvokeTool`/`requiresApproval`）。
- P1.5 先搭"谁能干什么"骨架：登录态校验 + 基础角色标记（如 `admin`）。
- 完整 RBAC（角色矩阵、按角色限流转/限工具）在 **P4 多角色协作**时实现。
- 注意：单用户阶段权限检查实质是放行，但骨架（接口、字段、鉴权中间件）要搭对，避免 P4 返工。

### 依赖顺序

```
B2 User 模型 → B1 Auth(JWT) → B3 权限骨架 → A5 多角色(P4) → B4 多租户(P4)
```

---

## 两个真遗漏的处理建议

### B8 通知系统（比登录更贴近差异化）

"人机交接"是 Conductor 的核心，交接的本质是"轮到人了要通知他"。但全文无通知模块。

- **P1 demo 阶段**：靠 UI 轮询/WS 推送糊弄（当前 Handoff 审批可被 WS 触达）。
- **多角色阶段（P4）**：必须做。否则人不知道该自己上场，"协同"断裂。
- **建议优先级**：通知系统与多角色强绑定，应随 P4 一起规划，不必早于登录。但要在本地图标注，避免被遗忘。

### B10 回放（承诺缺口）

README/ROADMAP 宣传"可回放"，事件账本（`AuditEvent`/`ToolEvent` 带 `seq`）也为此设计，但**没有"回放"功能模块**。

- 需补设计：回放触发方式（按钮？API？）、粒度（单 ToolRun？整个 WorkItem 流转？）、模式（只读重放？能否从某点重新执行？）。
- **建议**：在 P1 闭环跑通后，单独起一个设计/ADR 定义"回放"语义，否则"可回放"是空头承诺。事件账本已为它打好数据基础，只差功能。

---

## Phase 归属速查

| Phase | 模块 | 验收标志 |
|-------|------|---------|
| **P1**（进行中） | A1,A2,A3(Mock),A4(解析),A6,B5,B6,B7 | demo：报bug→AI修→人审批→done，全程可审计 |
| **P1.5**（近期） | B1,B2,B3(骨架) | 登录可用、User 表多用户就绪、权限骨架搭对 |
| **P2** | A3(Codex/CC),A8 | 真实 AI 工具接入、产物落库 |
| **P3** | A4(挂载),C2 | skills 真挂载与组合 |
| **P4** | A5,B3(完整),B4,B8 | 多角色协作、完整 RBAC、多租户、通知 |
| **P5** | A7,B9,B10,C1 | 全流程贯通、Git/CI、回放、扩展市场 |
