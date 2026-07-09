# ADR-0002：事实源（PostgreSQL）与事件账本

- 状态：Accepted
- 日期：2026-07-09
- 决策者：Conductor Contributors
- 关联：[Phase 1 架构设计](../design/phase-01-architecture.md)

## 背景

初版草案曾设想"Redis pub-sub 驱动状态流转"。codex 复核指出：这会导致 WS 掉线、Redis 重启、worker 崩溃后审计链断裂，无法满足"可观测、可治理、可回放"的核心承诺。Conductor 把 AI 操作的可审计性作为一等价值，必须有不可丢失的事实源。

## 决策

1. **PostgreSQL 是唯一事实源（source of truth）**。所有状态变更与事件先落 PG（事务内），再异步驱动执行与投递。
2. **Redis / BullMQ / WebSocket 只做异步执行与实时投递**，不承载真实状态。
3. **事件账本是一等模型**：
   - `AuditEvent`：系统级事实账本（跨所有领域）。
   - `ToolEvent`：单次 `ToolRun` 的流式事件，带单调递增 `seq`，用于幂等与回放。
4. **状态转移走 DB 事务 + 幂等 key**：状态变更与事件写入同一事务；ToolRun 用 `idempotencyKey` 保证重试安全。

## 数据流

```
command → DB txn(state change + AuditEvent) → BullMQ job
       → ToolProvider stream → persist ToolEvent/Artifact
       → WebSocket fan-out → human Handoff/approval
```

## 后果

- ✅ 可观测/可治理/可回放有坚实基础；worker/Redis 故障后状态可恢复。
- ✅ 事件账本天然支持审计与回放。
- ⚠️ 所有写路径需事务化，复杂度上升 → 通过 Engine 层统一封装状态机+事件写入。
- ⚠️ PG 写压力需监控 → ToolEvent 高频写入后续可分区/归档。

## 关联安全约束（CLI 执行）

`ToolProvider` 的 CLI spawn 是本地执行能力，非普通 API 调用。Phase 1：
- 默认 `MockToolProvider`；`CodexProvider` 受 feature flag 控制。
- 强制 `timeout` / `cancel` / workspace 隔离 / 命令 allowlist / 敏感环境变量过滤。
