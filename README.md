# 🎼 Conductor

> **An AI-native orchestration platform for the entire software development lifecycle.**
> 让可插拔的 AI 编码工具、可挂载的 skills 生态与多个人类角色，协同走完整个研发流程。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Status](https://img.shields.io/badge/Status-Alpha%20%7C%20Incubating-orange)](#)
[![AI-Native](https://img.shields.io/badge/AI-Native-blueviolet)](#)

---

## 这是什么

**Conductor** 是一个以 **AI 为第一公民**的软件开发流程管理平台。

它不是又一个需求管理工具，也不是又一个 CI/CD 系统——它是一个**编排层**：

> 编排 × AI 工具 × Skills 生态 × 人类角色，让软件开发的全流程在一个系统中贯通、可观测、可治理。

类比的话：如果 Linear 重新发明了需求管理、Cursor 重新发明了 IDE，那么 Conductor 想重新发明的是**"谁来驱动研发流程"**——不再是单纯的人推动工具，而是人与多个 AI agent 在一套 skills 约定下协同推进。

## 为什么是"编排(Conductor)"

一个现代的研发流程，实际上是由三类要素组合而成的：

| 维度 | 可选项（示例） | Conductor 的角色 |
|------|----------------|------------------|
| 🔌 **AI 编码工具** | Codex、Claude Code、…… | 可插拔适配，用户自由选择 |
| 🧩 **Skills 生态** | OpenSpec、Superpowers、gstack、…… | 创建项目时挂载，定义工作方式 |
| 👥 **人类角色** | PM、开发、测试、设计、Reviewer | 多角色协作，权限与流程分明 |

Conductor 像指挥家（Conductor）一样，把这三者调度起来，奏出完整、连贯的研发流程。

## 核心特性（规划中）

- 🔌 **可插拔 AI 工具层** —— 适配 Codex / Claude Code 等编码 Agent，用户按需选择，工具可热替换。
- 🧩 **Skills 挂载机制** —— 创建项目时选用 OpenSpec / Superpowers / gstack 等 skills 包，决定协作范式。
- 👥 **多角色协作** —— 内置角色与权限模型，PM / 开发 / 测试 / 设计 / Reviewer 各司其职。
- 🔄 **全流程贯通** —— 需求 → 设计 → 编码 → 测试 → 发布，状态在同一系统中流转、可追溯。
- 📜 **过程可观测、可治理** —— AI 的每一步操作、每一次人机交接都有记录，可审计、可回放。

> ⚠️ 当前仓库处于 **立项(Incubation) 阶段**，以上为愿景设计，尚无可运行代码。详见 [Roadmap](./ROADMAP.md)。

## 项目状态

🧪 **Alpha / Incubating** —— 正在定义范围与架构，欢迎早期讨论，暂不建议生产使用。

## 路线图

详见 [ROADMAP.md](./ROADMAP.md)。概览：

- **Phase 0 — 立项**（当前）：定位、范围、社区共识
- **Phase 1 — 架构骨架**：核心领域模型与扩展点
- **Phase 2 — AI 工具适配层**：Codex / Claude Code 适配
- **Phase 3 — Skills 挂载机制**
- **Phase 4 — 多角色工作流**
- **Phase 5 — 全研发流程贯通**

## 目录结构（规划）

```
conductor/
├── docs/            # 设计文档、规范、ADR
├── packages/        # 可复用包 / SDK（规划）
├── services/        # 核心服务（规划）
└── ...
```

> 当前仅含立项文档，上述目录尚未实现。

## 参与贡献

我们欢迎各种形式的贡献！请先阅读 [CONTRIBUTING.md](./CONTRIBUTING.md) 与 [行为准则](./CODE_OF_CONDUCT.md)。

- 💬 讨论：欢迎开 [Discussion / Issue] 交流想法
- 🐛 反馈：通过 Issue 描述你的场景与诉求
- 🤝 贡献：从 `good first issue` 开始

## License

[MIT](./LICENSE) © Conductor Contributors
