# Conductor UI 设计（v1）

> 状态：Draft · 负责人：Conductor Contributors
> 覆盖：信息架构 + 导航结构 + demo 页面详细设计 + MUI 组件选型
> 关联：[Schema v1](./schema-v1.md) · [功能模块全景](./modules-overview.md) · [P1 计划 Task 11a](../plans/2026-07-09-phase-01-backend-core.md) · [ADR-0001 技术栈](../adr/0001-tech-stack.md)
>
> **范围说明**：本文定整体信息架构（有哪些页面、怎么跳转）+ 导航结构 + demo 必需页面的详细设计 + MUI 组件选型。它是完整产品的 **UI 骨架**，但**不做所有页面**——非 demo 页面只标位置和职责，详细设计留到对应 Phase。Task 11a 照本文的 demo 页设计实现。

---

## 1. 设计原则

1. **demo 驱动**：所有设计服务于"报 bug → AI 修 → 人审批 → done"这 30 秒 whoa。不为 demo 服务的 UI 本轮不做。
2. **MUI 优先**：ADR-0001 已定 MUI，**不用 Tailwind**。组件选型直接用 MUI 组件，不自己造。
3. **实时优先**：核心交互是"看 AI 实时产出 + 人审批"，UI 要让"实时"和"等待人决策"两个状态显眼。
4. **状态可读**：WorkItem/ToolRun 的状态用 badge + 颜色，让人一眼看出"现在卡在哪、该谁动了"。
5. **可审计可见**：审计回放（R1）不是隐藏功能，是 UI 一等公民——兑现"可治理"承诺。

---

## 2. 信息架构（IA）

### 2.1 页面地图

```
Conductor
├── /login                      登录页（P1.5）
├── /projects                   项目列表（P1，demo 可单项目）
│   └── /projects/:id           项目详情 = WorkItem 列表
│       └── /work-items/:id     WorkItem 详情【demo 核心】
│           ├── (tab) 概览       标题/类型/状态/描述
│           ├── (tab) 运行       ToolRun 列表 + 实时日志【demo 核心】
│           ├── (tab) 审批       Handoff 面板（approve/reject）【demo 核心】
│           └── (tab) 审计       AuditEvent 时间线（R1 回放）
├── /me                         当前用户（P1.5）
└── /settings                   设置（远期占位，本轮不做）
```

### 2.2 导航结构

**顶栏（AppBar）**：
- 左：Logo "🎼 Conductor"
- 中：项目切换器（P1 demo 可固定单项目，下拉占位）
- 右：当前用户头像/角色（点击 → /me / 登出）

**侧边栏（Drawer）**——项目内导航：
- Work Items（工作项，默认页）
- （远期占位，灰显）：Skills / Members / Settings

> demo 阶段侧边栏极简：只有 Work Items 一项有效。占位项灰显并标注"coming soon"，暗示产品方向但不实现。

### 2.3 IA 与数据模型映射

| 页面 | 对应 schema 表 | 说明 |
|------|---------------|------|
| /login | User | 登录拿 JWT |
| /projects/:id | Project + WorkItem[] | 项目下工作项列表 |
| /work-items/:id 概览 | WorkItem | 单工作项元信息 |
| /work-items/:id 运行 | ToolRun + ToolEvent | 实时日志（socket.io 订阅） |
| /work-items/:id 审批 | Handoff | approve/reject（demo 核心） |
| /work-items/:id 审计 | AuditEvent | R1 时间线回放 |
| /me | User | 当前登录用户 |

---

## 3. 状态系统（贯穿全局）

### 3.1 WorkItemStatus → 颜色 + 文案

| 状态 | 颜色 | Badge 文案 | 含义 |
|------|------|-----------|------|
| draft | grey | 草稿 | 刚创建 |
| ready | blue | 就绪 | 可派给 AI |
| running | orange | 运行中 | AI 正在处理 |
| review | **purple** | **待审批** | 卡在人工，需 Reviewer 动作 |
| done | green | 完成 | 已闭环 |
| failed | red | 失败 | AI 执行失败 |

> **review 用最醒目的 purple**——这是 demo 的 whoa 停留点，UI 要让"等待人决策"一眼可见。

### 3.2 ToolRunStatus → 图标 + 文案

| 状态 | 图标 | 文案 |
|------|------|------|
| queued | ⏳ | 排队 |
| running | 🔄(spin) | 运行中 |
| succeeded | ✅ | 成功 |
| failed | ❌ | 失败 |
| canceled | ⛔ | 已取消 |

---

## 4. demo 核心页面详细设计

> 以下三页是 Task 11a 必须实现的。其余页面本轮只标位置。

### 4.1 页面 A：WorkItem 列表（/projects/:id）

**职责**：看到所有工作项，能快速报一个 bug 进入 demo 流程。

**布局**：

```
┌─ AppBar ────────────────────────────────────────┐
│ 🎼 Conductor   [项目: demo ▾]        [👤 admin ▾] │
├─ Drawer ─┬───────────────────────────────────────┤
│          │  工作项                          [+ 新建]│
│ Work Items│ ┌─────────────────────────────────┐  │
│ (灰显)    │ │[bug] 登录白屏      [待审批] purple│  │
│ Skills   │ │ running→review · 2分钟前          │  │
│ Members  │ ├─────────────────────────────────┤  │
│ Settings │ │[bug] 导出CSV乱码   [运行中] orange │  │
│          │ │ AI 正在处理 · 30秒前              │  │
│          │ ├─────────────────────────────────┤  │
│          │ │[task] 更新依赖     [完成] green   │  │
│          │ └─────────────────────────────────┘  │
└──────────┴───────────────────────────────────────┘
```

**组件**（MUI）：
- `List` + `ListItemButton`：工作项行，点击进详情
- `Chip`：type（bug=红/feature=蓝/task=默认）+ status badge（§3.1 颜色）
- `Button`（+ 新建）：打开 `Dialog` 表单（title/type/description）

**"新建 bug" 对话框**：
- 字段：标题（必填）、类型（Select：bug/feature/task，默认 bug）、描述（multiline）
- 提交 → `POST /projects/:id/work-items` → 列表顶部出现新项（status=draft）

**交互态**：
- 空列表：EmptyState 插画 + "报第一个 bug 试试"
- 加载：`Skeleton` 行
- 新建后：列表 unshift 新项，高亮 2 秒

---

### 4.2 页面 B：WorkItem 详情 - 运行 Tab（/work-items/:id，运行）

**职责**：实时看 AI 产出，这是"AI 在干活"的可视化。**demo 核心。**

**布局**：

```
┌─ AppBar ────────────────────────────────────────┐
│ ← 返回     [bug] 登录白屏         [待审批] purple │
├─────────────────────────────────────────────────┤
│ [概览] [运行 ●] [审批(1)] [审计]    ← Tabs       │
├─────────────────────────────────────────────────┤
│ ToolRun #tr_xxx   [运行中 🔄]   mock provider    │
│ ┌─────────────────────────────────────────────┐ │
│ │ 终端样式实时日志（黑底绿字）                   │ │
│ │ $ [mock] 处理: 修复登录白屏                   │ │
│ │ > 分析 cookie 过期逻辑...                     │ │
│ │ > 定位 auth.ts:47 null 检查缺失...            │ │
│ │ > 生成补丁...                                │ │
│ │ ▌  ← 光标（running 时闪烁）                   │ │
│ └─────────────────────────────────────────────┘ │
│ 事件: started → output×3 → (待 completed)        │
└─────────────────────────────────────────────────┘
```

**组件**：
- `Tabs`：概览/运行/审批/审计，审批 Tab 有 `Badge` 显示 pending 数
- `Paper`（黑底）：终端样式日志区，`monospace` 字体
- 实时日志：socket.io 订阅 `subscribe { runId }`，收 `tool-event:runId` 追加；`output` 事件追加文本，`started/completed` 显示分隔
- `Chip`：ToolRun 状态（§3.2）

**交互态**：
- running：光标闪烁，日志自动滚到底（`scrollTop = scrollHeight`）
- succeeded：日志区变灰，显示 `[completed] exitCode 0`，自动跳"审批"Tab 提示
- failed：日志区红色边框，显示错误
- 无 ToolRun：EmptyState "点'派给 AI'开始"

**"派给 AI"按钮**（概览或运行 Tab，status=ready 时可见）：
- 点击 → `POST /work-items/:id/runs`（body: prompt + idempotencyKey=uuid）→ 自动切到运行 Tab，开始实时日志

---

### 4.3 页面 C：WorkItem 详情 - 审批 Tab（/work-items/:id，审批）

**职责**：人以 Reviewer 身份批准/打回。**demo 的 whoa 顶点。**

**布局**：

```
┌─ AppBar ────────────────────────────────────────┐
│ ← 返回     [bug] 登录白屏         [待审批] purple │
├─────────────────────────────────────────────────┤
│ [概览] [运行] [审批 ●(1)] [审计]    ← Tabs       │
├─────────────────────────────────────────────────┤
│  ┌─ 审批卡片 ─────────────────────────────────┐ │
│  │ 🟣 需要你审批                              │ │
│  │ AI 已完成修复，等待 Reviewer 确认。         │ │
│  │                                            │ │
│  │ AI 产出摘要：                              │ │
│  │ • 定位 auth.ts:47 cookie 过期未处理        │ │
│  │ • 新增 null 检查 + 重定向 /login           │ │
│  │                                            │ │
│  │ 审批意见（可选）：[_____________________]  │ │
│  │                                            │ │
│  │      [✗ 打回]         [✓ 批准] (primary)   │ │
│  └────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

**组件**：
- `Card` + `CardContent`：审批卡片
- `Alert`（severity=info，紫色）：醒目提示"需要你审批"
- `TextField`（multiline）：审批意见（可选）
- `Button`（color=error）："打回" → `POST /handoffs/:id/reject`
- `Button`（color=primary, variant=contained）："批准" → `POST /handoffs/:id/approve`

**交互态**：
- pending：显示审批卡片，按钮可用
- approved：卡片变绿 "✓ 已批准"，WorkItem 状态变 done，按钮禁用
- rejected：卡片变橙 "✗ 已打回"，WorkItem 回到 running，提示"AI 将重新处理"
- 无 pending Handoff：EmptyState "暂无待审批项"

**审批流闭环**（demo 30 秒的关键动线）：
```
列表看到 [待审批] → 进详情 → 审批 Tab → 点[批准]
→ 状态变 done → 列表项变 [完成] green
```

---

## 5. 审计回放页（R1，WorkItem 详情 - 审计 Tab）

> 数据已具备（schema-v1 AuditEvent + ToolEvent），Task 11a 可最小实现。

**职责**：兑现"可回放"承诺，按时间线回看整个 WorkItem 发生了什么。

**布局**：纵向 `Timeline`（MUI Timeline），每条一行：
```
─── 14:02:01 [system] 创建 WorkItem（draft）
─── 14:02:15 [user]   标记 ready
─── 14:02:20 [system] 触发 ToolRun #tr_xxx（running）
─── 14:02:21 [tool]   started
─── 14:02:22 [tool]   output: 分析 cookie...
─── 14:02:25 [tool]   completed exitCode 0
─── 14:02:25 [system] 转入 review（创建 Handoff）
─── 14:03:10 [user]   handoff.approved → done  ← 高亮（人决策点）
```

**组件**：MUI `Timeline` + `TimelineItem`，左侧时间戳，按 `actorType` 用不同 icon（system=齿轮/user=人/tool=机器人）。

---

## 6. MUI 组件选型清单

| 用途 | MUI 组件 | 出现页面 |
|------|---------|---------|
| 顶栏 | `AppBar` + `Toolbar` | 全局 |
| 侧栏 | `Drawer` | 项目内 |
| 工作项行 | `List`/`ListItemButton` | 列表页 |
| 状态标签 | `Chip`（color） | 全局 |
| 类型/状态 | `Chip` + 自定义 color | 列表/详情 |
| 新建对话框 | `Dialog` + `TextField` + `Select` | 列表页 |
| 详情分页 | `Tabs` + `Tab` | 详情页 |
| 审批数提示 | `Badge`（Tab 上） | 详情页 |
| 终端日志 | `Paper`（黑底）+ `Box`（overflow auto） | 运行 Tab |
| 审批卡片 | `Card` + `Alert` | 审批 Tab |
| 按钮 | `Button`（contained/outlined, color） | 全局 |
| 审计时间线 | `Timeline` | 审计 Tab |
| 空状态 | `Box` + 插画/图标 + 文案 | 多处 |
| 加载 | `Skeleton` / `CircularProgress` | 多处 |
| 表单 | `TextField` + `Select` + `FormControl` | 登录/新建 |
| 提示 | `Snackbar` | 操作反馈 |

> 全部 MUI 自带，零额外 UI 库。主题用 MUI `createTheme`，定 §3 的状态色板。

---

## 7. 登录页（P1.5，简单）

**布局**：居中 `Card`，email + password 两个 `TextField`，登录按钮。
- 提交 → `POST /auth/login` → 存 JWT（localStorage）→ 跳 /projects
- 失败：`Alert`（error）"凭据无效"（与后端防枚举一致）
- 未登录访问任何页 → 重定向 /login（路由守卫）

---

## 8. 不做的页面（本轮占位，灰显）

| 页面 | 何时做 | 本轮处理 |
|------|--------|---------|
| 用户管理（列表/CRUD） | P4 | Drawer 灰显 "Members (coming soon)" |
| Skills 管理 | P3 | Drawer 灰显 "Skills (coming soon)" |
| 设置 | 远期 | Drawer 灰显 "Settings (coming soon)" |
| 组织/租户管理 | P4 | 不占位 |
| 通知中心 | P4（B8） | 不占位 |

> 占位项的作用：暗示产品方向（开源访客一眼看到未来形态），但不实现，点击提示 "coming soon"。

---

## 9. 响应式与可访问性（最低要求）

- demo 阶段**优先桌面端**（1280px+）。移动端不专门优化，但 MUI 自带响应式不破。
- 键盘可达：所有按钮/表单可 Tab 聚焦，审批可用 Enter 确认。
- 颜色对比度：状态色满足 WCAG AA（MUI 默认色板基本满足，review 的 purple 需校验）。
- 不依赖纯颜色传达信息：Chip 同时带文字文案（§3.1），色盲可读。

---

## 10. 实现指引（给 Task 11a）

1. 技术栈：Next.js App Router + MUI（ADR-0001）。
2. 目录：`apps/web/app/`，按 §2.1 IA 组织路由。
3. 状态管理：demo 阶段用 React 原生（useState/useEffect）+ fetch，不引入 Redux/Zustand。
4. 实时：socket.io-client 订阅 `tool-event:runId`（§4.2）。
5. 鉴权：fetch 带 `Authorization: Bearer <token>`（P1.5 后），路由守卫拦截未登录。
6. 主题：`createTheme` 定义 §3 状态色板，全局 `ThemeProvider`。
7. **验收**：照 §4 的三页 demo 动线跑通，即 Task 11a 完成。

---

## 修订记录

| 日期 | 变更 |
|------|------|
| 2026-07-09 | v1 初版。信息架构 + 导航 + demo 三页详细设计 + MUI 选型 + 审计回放页。覆盖 demo 需求，非 demo 页占位灰显。来源：schema-v1 + modules-overview + ADR-0001。 |
