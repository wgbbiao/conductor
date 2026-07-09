# ADR-0003：WorkItem.type 而非独立 Bug 实体

- 状态：Accepted
- 日期：2026-07-09
- 决策者：Conductor Contributors
- 关联：[Phase 1 架构设计 §4](../design/phase-01-architecture.md) · [Phase 1 计划 v1.1](../plans/2026-07-09-phase-01-backend-core.md)

## 背景

Phase 1 的 demo 闭环以"报一个 bug → AI 自动修 → 人审批 → done"作为开源冷启动的 whoa 点。这引出一个建模问题：**bug 是什么？**

初版领域模型里 `WorkItem` 只有 `title` + `description` 两个字符串，没有 bug 的概念。两种可能：

1. **bug 是 WorkItem 的一种**（加 `type` 字段区分 bug/feature/task）。
2. **bug 是独立实体**，与 `WorkItem` 平级，有自己的生命周期（报告 → 确认 → 去重 → 分派 → 修复 → 验证 → 关闭）。

选项 2 在建模上更"纯粹"——bug 确实有一些 WorkItem 承载不了的东西（复现步骤、严重级别、关联代码位置、去重/确认环节）。

但在 office-hours + grill-me 评审中追问后，确认了：**选独立实体是"建模洁癖"，不是真需要**——

- Phase 1 的 bug 和 feature 走的流程几乎一样（都是 draft → ready → running → review → done），只是入口不同。
- 所谓"bug 特有属性"（严重级别、复现步骤）在 demo 阶段都可塞进 `description`，不影响演示 whoa。
- 为这些差异扛一整套独立状态机，会让 Phase 1 的状态机工作量翻倍，与"第一版必须能 demo"的硬目标直接打架。

## 决策

**bug 是 `WorkItem` 的一种，通过 `type` 字段区分。**

- `WorkItemType = "bug" | "feature" | "task"`（Phase 1 仅做区分，不为每种类型实现独立流程）。
- `type` 字段同时为后续"不同类型走不同工作流"留口——这本身就是编排平台的核心能力之一。
- Phase 1：所有类型共用同一套状态机（`defaultWorkflowDefinition`），不按 type 分流。

## 后果

- ✅ Phase 1 状态机工作量不翻倍，demo 能更快交付。
- ✅ `type` 字段为"按类型路由到不同角色/流程"这种真正的编排能力预留了扩展点，决策可逆。
- ✅ bug 特有属性（严重级别等）可后续按需加列，不必现在决定。
- ⚠️ 所有类型现在共用一套流程，无法演示"bug 必须先确认/去重才能进开发"这类差异——**这是 Phase 1 有意裁剪**，demo 不需要它。
- ⚠️ 若未来 bug 的生命周期与 feature 实质分化（如必须经过"确认"环节），届时再评估是否拆为独立实体或引入按 type 的子状态机。

## 备选

- **独立 `Bug` 实体（与 WorkItem 平级）**：建模纯粹，但 Phase 1 多一整套表 + 状态机，拖慢冷启动，且 demo 不需要其差异化能力。**未采纳**——评审确认是建模洁癖而非真需求。

## 决策依据（grill-me 记录）

此决策来自 2026-07-09 的 grill-me 评审。当时先倾向"bug 独立实体"，追问"是真需要独立生命周期（如 bug 必须先确认/去重）还是建模洁癖"后，确认是后者。**保留此依据以防止日后有人因洁癖重新把 Bug 拆出去，除非能证明 bug 有了 WorkItem 承载不了的、实质分化的生命周期需求。**
