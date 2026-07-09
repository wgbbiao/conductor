# 真实仓库 + Codex 改代码 + PR 落地 流程设计

> 状态：Draft · 负责人：Conductor Contributors
> 关联：[schema-v1](./schema-v1.md)（本文修订其 Frozen 字段）· [phase-01-architecture](./phase-01-architecture.md) · [modules-overview](./modules-overview.md) · [ADR-0002 事实源](../adr/0002-source-of-truth-and-event-ledger.md)
>
> **定位**：把 Conductor 从「抽象 WorkItem + Mock AI 打印文字」升级为「真实代码仓库 + Codex CLI 改代码 + 人审 diff + 建 PR」的真实 AI 开发平台（Devin/Factory 形态）。是对 P1 的**扩展**，不推翻。

---

## 1. 背景与目标

P1 已跑通抽象闭环（报 bug → Mock AI → 审批 → done），但：
- `Project` 只有 `name/description`，**没有仓库地址**（schema-v1 定死时把 Repository 推到了 P2）；
- `MockToolProvider` 在 `/tmp/ws` 打印文字，**不碰任何真实代码**；
- 审批的是"文本日志"，不是真实代码改动。

本设计把"项目 = 真实 git 仓库"这一等公民机制前置进来：每个项目绑定 git URL，Conductor clone 到内部 workspace，Codex 在 feature 分支真实改代码，人审批 diff，通过则 push + 建 GitHub PR。

**目标 demo 动线**（用 `git@github.com:wgbbiao/test-demo.git`）：
> 建 Project(test-demo) → 建 WorkItem「把页面背景白改蓝」→ 派给 Codex → 看 diff → 批准 → GitHub 上出现 PR。

---

## 2. 端到端形态

```
① UI 创建 Project：填 name + git URL（git@github.com:wgbbiao/test-demo.git）
② Conductor 用本机 SSH key clone → 内部 workspace（./workspaces/<projectId>/repo）
③ 项目下建 WorkItem（type=bug/feature/task）→ 标记就绪
④ 派给 AI：WorkspaceService 建分支 conductor/<workItemId>，
   CodexProvider spawn `codex exec "<prompt>"`（cwd=workspace）让它改
⑤ Codex 退出 0 → Conductor `git diff <baseCommit>..HEAD` 提取改动 → 存 Artifact(type=diff)
   + Codex 的 stdout/stderr 走现有 ToolEvent(output) → socket.io 实时推送
⑥ WorkItem 进 review：人在 UI 审批 Tab 看 **diff 视图**
⑦ approve → `git push origin <branch>` + `gh pr create` → PR URL 回写
   reject → 打回 running，下次派 AI 用新分支 conductor/<wi>-<n>
```

事实源仍在 PG（ADR-0002）：状态变更、ToolEvent、Artifact 元数据、AuditEvent 同事务；workspace 文件系统与 git 只是执行载体。

---

## 3. 数据模型变更（修订 schema-v1 的 Frozen 契约）

| 表 | 改动 | 字段 |
|---|---|---|
| `Project` | 加仓库字段 | `repoUrl String`、`defaultBranch String @default("main")` |
| `ToolRun` | 加分支/基准 | `branch String?`、`baseCommit String?` |
| `Artifact` | 启用读写（原占位） | 加 `type String`（`diff`）、`content String`（diff 文本）；`toolRunRef` 仍逻辑引用 |

> `Repository` **不单独建表**——`Project.repoUrl` 直接存（demo 单仓库/项目足够；多仓库关联留远期）。
> workspace **不入库**：路径按 `projectId` 推导（`./workspaces/<projectId>/repo`），其状态由 git 本身承载（分支/commit），不双写 DB。

迁移：`prisma migrate dev --name add_repo_and_diff`。现有 demo WorkItem 保留；新流程跑在新 Project 上。

---

## 4. 新增后端组件

| 组件 | 职责 |
|---|---|
| `WorkspaceService` | clone（SSH）/ 路径管理 / `git checkout -b` / 同步 `defaultBranch` |
| `CodexProvider`（实现 `ToolProvider`） | spawn `codex exec`，cwd 锁 workspace，流式 output，超时/取消 |
| `GitService` | `git diff` 提取、`git rev-parse`（baseCommit）、`git push` |
| `PrService` | `gh pr create`（复用本机 gh 认证） |

`MockToolProvider` **保留**（不依赖真仓库的测试与兜底）。`CodexProvider` 由现有 `FEATURE_CODEX_PROVIDER` 门控之外的"项目级"开关选择——Project 有 `repoUrl` 则走 Codex，否则可降级 Mock。

---

## 5. Codex 执行细节

- **调用**：`codex exec "<prompt>"`（非交互），`cwd = workspaces/<projectId>/repo`，继承本机环境（codex 的 OpenAI 认证已配）。
- **prompt 组装**：WorkItem.title + description + 约束（"只改必要文件；改完不要 commit/push，Conductor 处理 git"）。
- **流式**：codex 的 stdout/stderr → `ToolEvent(output, stream)`，复用现有 socket.io 推送（运行 Tab 实时日志不变）。
- **完成判定**：退出码 0 → 提 diff；非 0 → ToolRun failed。
- **沙箱最小集**（落实 B11 契约）：cwd 锁定 workspace + 超时（默认 120s，`AbortController` + kill 子进程）+ 取消；命令 allowlist / 敏感环境变量过滤留后续。

---

## 6. diff 提取与 Artifact

- ToolRun 开始：`baseCommit = git rev-parse <defaultBranch>`，`branch = conductor/<workItemId>`，`git checkout -b <branch>`。
- Codex 改完：`GitService.diff(baseCommit..HEAD)` → `Artifact.create({ type: "diff", content: <diffText>, toolRunRef: runId })`。
- review 时审批 Tab 拉该 ToolRun 的 diff Artifact 渲染。

---

## 7. 审批与 PR 落地

- **approve**（`HandoffsService.decide` 扩展）：
  - `git push origin <branch>`
  - `gh pr create --title <wi.title> --body <WorkItem 摘要 + diff 统计>`
  - PR URL 写入 `AuditEvent.payload.prUrl`；WorkItem 转 done。
  - UI 显示「PR 已创建」+ 链接。
- **reject**：WorkItem 回 running，下一次 `start` 用新分支 `conductor/<wi>-<n>`（旧分支保留可查）。

---

## 8. UI 变更（apps/web）

- **项目列表页**（新顶层 `/`）：项目卡（name + repoUrl + WorkItem 数 + 状态）；新建项目 Dialog 填 name + **git URL**；卡片「重新 clone」兜底按钮。
- 进项目 → 现有 WorkItem 列表（复用）。
- **详情运行 Tab**：实时日志（Codex 输出，复用）+ 改动文件列表。
- **详情审批 Tab**（重点增强）：
  - 顶部改动汇总：「N 个文件 · +X · −Y」
  - **diff 视图**（`react-diff-viewer`）：unified/split 切换、行号、语法高亮、+/- 着色
  - 按**文件分组**折叠（标题 = 文件路径 + 该文件增删统计）
  - approve 后显示 PR 链接卡片
- 状态色板、Tabs、AppBar、登录、socket.io 实时机制全部复用现有。

---

## 9. 初始化 test-demo（实现第一步）

创建 `index.html`（白底简单页面）+ `README.md`，push 到 `test-demo` 的 main，作为 AI 要改的起点代码（"白色"明确存在、可验证）。

---

## 10. 范围裁剪（明确不做）

- ❌ 多仓库认证管理（统一走本机 SSH key + `gh`）
- ❌ workspace 自动清理 / 并发隔离（单进程顺序处理）
- ❌ PR 评论 / CI 触发 / 自动合并
- ❌ codex 模型/参数可配（先写死，后续 config 化）
- ❌ 多仓库/子模块、Organization/Tenant

---

## 11. 与现有 P1 的关系

复用：WorkItem 状态机与 `defaultWorkflowDefinition`、Handoff 审批、ToolRun 幂等与事件账本、AuditEvent、socket.io 实时、JWT auth、BullMQ worker。
扩展：Project 加仓库、CodexProvider、Workspace/Git/Pr 服务、diff Artifact、审批 Tab diff 视图。
保留：MockToolProvider（测试/兜底）。

---

## 修订记录

| 日期 | 变更 |
|------|------|
| 2026-07-09 | 初版。把"真实仓库 + Codex + PR"前置，修订 schema-v1（Project/ToolRun/Artifact）。来源：用户反馈"P1 demo 没有项目机制、项目要有地址"。 |
