# ADR-0001：技术栈选型（全 TypeScript 栈 + MUI）

- 状态：Accepted
- 日期：2026-07-09
- 决策者：Conductor Contributors
- 关联：[Phase 1 架构设计](../design/phase-01-architecture.md)

## 背景

Conductor 是 AI 原生的研发流程编排平台。技术栈需支持：可插拔 AI 工具适配（spawn CLI / SSE / MCP 流式）、流程编排引擎（状态机/并发/长任务）、实时多角色协作、严格的扩展点契约、低开源贡献门槛。

候选方案：① 全 TypeScript 栈 ② Go 后端 + React ③ Python 后端 + React。

## 决策

采用 **全 TypeScript 栈**：

| 层 | 选型 |
|---|---|
| Monorepo | Turborepo + pnpm |
| 前端 | Next.js (App Router) + React + TS + **MUI** |
| 后端 | NestJS + TS |
| 数据 | Prisma + PostgreSQL + Redis |
| 编排/任务 | BullMQ |
| 实时 | WebSocket via **socket.io**（`@nestjs/platform-socket.io`） |

UI 框架选用 **MUI（Material UI）**——全球使用量最大的开源 React UI 框架（明确不使用 Tailwind）。

## 理由

1. **端到端类型安全**：三个扩展点（ToolProvider/SkillPack/Role）的契约可用 TS 接口贯穿前后端，最适合"可插拔"。
2. **AI 工具适配**：Codex/Claude Code 官方示例多为 JS/TS，spawn CLI + 流式（Vercel AI SDK 等）最顺。
3. **开源贡献门槛**：JS/TS 开发者基数最大，最易招贡献者；Plane/Dub/Langfuse 等标杆同栈。
4. **实时协作生态**成熟。
5. **为何不用 Go**：编排性能更强，但前后端语言割裂，扩展点契约需 protobuf/OpenAPI 维护成本高。
6. **为何不用 Python**：LLM 生态最强，但 Conductor 的 LLM 能力靠外部 Agent（Codex/Claude Code）完成，不需要训练/推理生态；动态语言不利于大型平台维护。

## 后果

- ✅ 全栈语言一致，贡献门槛低，契约类型直达。
- ⚠️ 编排引擎 CPU 密集场景弱于 Go → 用 BullMQ + Redis 队列 + 独立 worker 弥补；若后续成为瓶颈，可把核心引擎用 Go 重写（混合栈，留 ADR 出口）。

## 备选

- Go 后端 + React：性能/部署更优，但契约维护成本高，未采纳。
- Python 后端 + React：LLM 生态强但与本项目核心诉求不匹配，未采纳。

## 修订记录

| 日期 | 变更 | 来源 |
|------|------|------|
| 2026-07-09 | 实时层由裸 `ws` 改为 **socket.io**。理由：实施计划实际依赖 `@nestjs/platform-socket.io`（网关、`@SubscribeMessage`、`socket.io-client`），与裸 `ws` 不是同一套 API。统一为 socket.io 以免贡献者困惑。socket.io 底层仍是 WebSocket，并自带重连/房间/降级，适合实时事件投递。 | [Phase 1 计划 v1.1](../plans/2026-07-09-phase-01-backend-core.md) 评审（office-hours + grill-me） |
