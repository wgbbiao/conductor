# ADR-0004：账号模型选型

- 状态：Accepted
- 日期：2026-07-09
- 决策者：Conductor Contributors
- 关联：[功能模块全景 B1/B2/B3](../design/modules-overview.md) · [Phase 1.5 计划](../plans/2026-07-09-phase-1.5-auth-user-rbac.md) · [Phase 1 计划 v1.2](../plans/2026-07-09-phase-01-backend-core.md)

## 背景

Conductor 的核心特性之一是**多角色协作**（PM/开发/测试/Reviewer）与**权限治理**（PolicyEngine）。这意味着"用户"不是附属功能，而是将来要和 Role、Handoff、AuditEvent、PolicyContext 深度绑定的核心实体。

Phase 1.5 需要引入登录/用户/权限。在 grill-me 评审中，核心取舍是：**"精简"该精简在哪一层？**

两个方向：

1. **方案 A：单机模式 + 极简本地账号**。User 表字段最小化（够本地登录即可），密码只防手滑。好处：几天就能做。坏处：等做多角色/多租户时账号体系要重写，连 `Handoff.decidedBy`、`AuditEvent.actorId`、`PolicyContext.userId` 全部返工。
2. **方案 B：多用户就绪建模，精简功能**。User 表从一开始按多用户设计，登录用成熟方案（JWT），但功能上只暴露"登录 + 查当前用户"，不做注册/多人界面。

评审确认：选 A 会让 Phase 4 多角色协作时返工，而 Conductor 的产品方向决定了"用户"迟早多人。因此模型不留债，精简在功能层。

## 决策

**采用方案 B：多用户就绪建模，精简功能。**

### 模型层（不留债）

- `User` 表按多用户建模：`id` / `email`(唯一) / `passwordHash`(bcrypt) / `displayName` / `role` / 时间戳。
- `role` 枚举：`admin | member`（Phase 1.5 单用户阶段默认 admin；为 Phase 4 完整 RBAC 留口）。
- 登录用 **JWT**（access token）。

### 功能层（可精简）

**做**：登录（`POST /auth/login`）、查当前用户（`GET /me`）、CLI seed 创建用户（`pnpm user:create`）、登录态校验守卫、role 骨架（isAdmin）。

**不做**（有意裁剪，待后续 Phase）：
- 注册界面、用户列表/CRUD 界面
- OAuth/SSO、邮箱验证、找回密码
- 完整 RBAC（角色矩阵、资源级权限）—— 留 Phase 4 多角色协作时做

### 密码存储

**bcrypt**（cost ≥12）。hash 不进 AuditEvent/payload/日志。用户不存在与密码错返回同一消息，防账号枚举。

### 初始用户来源

**CLI seed 命令**（`pnpm user:create`），不做注册界面。demo 脚本自动 seed。比"改 env 配置用户"干净，也不引入注册流程的复杂度。

## 后果

- ✅ Phase 4 多角色/多租户时，User 模型无需重写，`Handoff.decidedBy`/`AuditEvent.actorId`/`PolicyContext.userId` 从一开始就对。
- ✅ 模型可逆：role 字段为后续细粒度权限留口。
- ⚠️ 比"极简单机账号"多一点点前期工作（JWT 基础设施、bcrypt），但换来零返工。
- ⚠️ 单用户阶段权限检查实质是放行，但骨架（接口、字段、鉴权中间件）搭对，避免 Phase 4 返工——这是有意识的取舍。

## 备选

- **方案 A（单机极简账号）**：最快，但 Phase 4 多角色时账号体系重写、actor 字段全改。评审确认为技术债，**未采纳**。
- **OAuth/SSO 起步**：多租户友好，但 Phase 1.5 不需要，且引入第三方依赖抬高开源贡献门槛。**未采纳**，留待确有多租户需求时评估。

## 决策依据（grill-me 记录）

此决策来自 2026-07-09 的 grill-me 评审，经多轮确认：

1. 账号模型底线：**预留多用户起步**（不为单用户简化模型）。
2. 内部决策四连确认：bcrypt 存密码 ✅ / CLI seed 创用户 ✅ / 权限骨架=role+中间件 ✅ / REST 全挂 JWT ✅。
3. 执行顺序：**先 P1.5 后 P1 demo**——Handoff/Audit 的 actor 从一开始用真 userId，零返工。

**保留此依据以防止日后有人因"现在只有一个用户"而把 User 表简化为单机模型，除非能证明产品方向不再是多角色协作平台。**
