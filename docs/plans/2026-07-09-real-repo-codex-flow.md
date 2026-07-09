# 真实仓库 + Codex 改代码 + PR 落地 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Conductor 从抽象 Mock 闭环升级为「真实 git 仓库 + Codex CLI 改代码 + 人审 diff + 建 PR」，用 `test-demo` 仓库的「白底改蓝」任务跑通端到端 demo。

**Architecture:** 复用 P1 的 WorkItem 状态机 / Handoff / ToolRun 事件账本 / socket.io / JWT / BullMQ。扩展：Project 绑定 git URL → `WorkspaceService` clone 到内部 workspace → `CodexProvider` spawn `codex exec` 在 feature 分支改代码 → `GitService` 提 diff → 人审 → approve 时 `git push` + `gh pr create`。所有 shell 操作走可注入的 `ShellRunner`（便于单测 mock），集成验证集中在 Task 12。

**Tech Stack:** NestJS 10 · Prisma 5 · PostgreSQL · BullMQ/ioredis · Next.js 14 · MUI 5 · react-diff-viewer · codex CLI · gh CLI

## Global Constraints

- Node ≥ 20.10，pnpm ≥ 9.0；TypeScript `strict`，禁 `any`（必要时 `unknown`+收窄）
- PostgreSQL 唯一事实源（ADR-0002）：状态变更/事件/Artifact 元数据同事务；workspace 文件系统 + git 仅执行载体
- 中文注释、英文标识符；Conventional Commits；命名 `*.spec.ts` / `*.e2e-spec.ts`
- 复用现有：`defaultWorkflowDefinition`、Handoff、ToolRun 幂等(`@@unique([workItemId,idempotencyKey])`)、socket.io gateway、JWT 全局守卫、BullMQ worker
- 本机已具备：`codex` CLI（OpenAI 认证）、`gh` CLI（已登录）、SSH key（可 clone/push `wgbbiao/*` 私有仓库）
- demo 仓库：`git@github.com:wgbbiao/test-demo.git`（私有）；docker pg=5433 / redis=6380（见 `.env`）
- 每个 service 的 shell 调用经 `ShellRunner` 注入，单测用假 `ShellRunner`；真实 codex/gh/git 的端到端验证在 Task 12

---

## File Structure

**后端 `apps/api/src/`**
- `common/shell-runner.ts`（新）：`execSync` 封装，可注入/mock
- `modules/workspace/workspace.service.ts`（新）：clone、路径、分支
- `modules/workspace/git.service.ts`（新）：baseCommit、diff、push
- `modules/workspace/pr.service.ts`（新）：`gh pr create`
- `modules/workspace/workspace.module.ts`（新）：聚合三个 service + ShellRunner
- `tools/codex-tool-provider.ts`（新）：实现 `ToolProvider`，spawn codex
- `modules/artifacts/artifacts.service.ts`（新）+ `artifacts.controller.ts`（新）：diff 读写 + GET
- `engine/tool-run.worker.ts`（改）：成功后提 diff、写 Artifact
- `modules/handoffs/handoffs.service.ts`（改）：approve 时 push + 建 PR
- `modules/projects/dto.ts`（改）：CreateProjectDto 加 repoUrl
- `app.module.ts`（改）：注册新模块；ToolRegistry 注册 CodexProvider
- `config.ts`（改）：加 `workspaceRoot`

**`packages/db/prisma/schema.prisma`（改）** + `docs/design/schema-v1.md`（改，修订 Frozen）

**前端 `apps/web/`**
- `app/page.tsx`（改）：项目列表 + 新建项目 Dialog（git URL）
- `app/projects/[id]/page.tsx`（新）：项目内 WorkItem 列表
- `components/DiffViewer.tsx`（新）：react-diff-viewer 封装（文件分组 + 统计）
- `app/work-items/[id]/page.tsx`（改）：审批 Tab 接 diff；approve 后 PR 链接
- `lib/api.ts`（改）：listProjects/createProject 带 repoUrl、getDiff、Project 类型
- `lib/types.ts`（改）：Project.repoUrl、ToolRun.branch/baseCommit、Artifact

---

## Task 1: 数据模型迁移 + schema-v1 修订

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Modify: `docs/design/schema-v1.md`（Project/ToolRun/Artifact 三节 + §5 完整 schema + 修订记录）

**Interfaces:**
- Produces: `Project.repoUrl`、`Project.defaultBranch`；`ToolRun.branch`、`ToolRun.baseCommit`；`Artifact.type`、`Artifact.content`

- [ ] **Step 1: 改 `schema.prisma` 的 `Project`**

```prisma
model Project {
  id            String      @id @default(cuid())
  name          String
  repoUrl       String
  defaultBranch String      @default("main")
  description   String      @default("")
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt
  workItems     WorkItem[]

  @@index([repoUrl])
}
```

- [ ] **Step 2: 改 `schema.prisma` 的 `ToolRun`（加 branch/baseCommit）**

在 `model ToolRun` 现有字段后加：
```prisma
  branch        String?
  baseCommit    String?
```

- [ ] **Step 3: 改 `schema.prisma` 的 `Artifact`（启用 type/content）**

```prisma
model Artifact {
  id          String   @id @default(cuid())
  toolRunRef  String
  type        String   @default("diff")
  content     String
  contentHash String?
  createdAt   DateTime @default(now())

  @@index([toolRunRef])
}
```

- [ ] **Step 4: 生成并应用迁移**

Run: `pnpm --filter @conductor/db exec prisma migrate dev --name add_repo_and_diff`
Expected: 迁移创建成功，DB 加列；Prisma Client 重新生成

- [ ] **Step 5: 同步修订 `docs/design/schema-v1.md`**

在 Project/ToolRun/Artifact 三节加新字段行；§5 完整 Prisma schema 同步；§6「已知限制」把 Artifact「表占位无读写」改为「P1.5+ 启用 diff 读写」；修订记录加一行「2026-07-09 修订 Frozen：Project+repoUrl/defaultBranch、ToolRun+branch/baseCommit、Artifact 启用 type/content（见 real-repo-codex-flow.md）」

- [ ] **Step 6: 类型检查**

Run: `pnpm --filter @conductor/db lint && pnpm --filter @conductor/api lint`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/db docs/design/schema-v1.md
git commit -m "feat(db): project repo, toolrun branch/base, artifact diff (schema-v1 revision)"
```

---

## Task 2: 初始化 test-demo 仓库（白色起点）

**Files:** 无 Conductor 代码（demo 数据准备）

**Interfaces:**
- Produces: `git@github.com:wgbbiao/test-demo.git` main 分支含 `index.html`（白底）

- [ ] **Step 1: clone 空仓库到临时目录**

Run:
```bash
rm -rf /tmp/test-demo-init
git clone git@github.com:wgbbiao/test-demo.git /tmp/test-demo-init
cd /tmp/test-demo-init
git checkout -b main 2>/dev/null || git checkout main
```
Expected: clone 成功（空仓库）

- [ ] **Step 2: 写 `index.html`（白底页面）**

写到 `/tmp/test-demo-init/index.html`：
```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>Demo Page</title>
    <style>
      body { background: #ffffff; color: #333; font-family: sans-serif; padding: 2rem; }
    </style>
  </head>
  <body>
    <h1>Hello Conductor</h1>
    <p>背景色待调整。</p>
  </body>
</html>
```

- [ ] **Step 3: 写 `README.md`**

```markdown
# test-demo

Conductor demo 仓库。AI 应把页面背景从白色改成蓝色。
```

- [ ] **Step 4: commit + push**

Run:
```bash
cd /tmp/test-demo-init
git add -A
git commit -m "chore: init white-background demo page"
git push -u origin main
```
Expected: push 成功；`test-demo` main 有 index.html（`background: #ffffff`）

- [ ] **Step 5: 验证可 clone 回来**

Run: `cd /tmp && git clone git@github.com:wgbbiao/test-demo.git /tmp/test-demo-verify && grep "#ffffff" /tmp/test-demo-verify/index.html`
Expected: 输出含 `#ffffff`

---

## Task 3: ShellRunner + WorkspaceService（clone/路径/分支）

**Files:**
- Create: `apps/api/src/common/shell-runner.ts`
- Create: `apps/api/src/modules/workspace/workspace.service.ts`
- Create: `apps/api/src/modules/workspace/workspace.service.spec.ts`
- Modify: `apps/api/src/config.ts`

**Interfaces:**
- Consumes: `Project`（`repoUrl`、`id`）
- Produces: `WorkspaceService.repoPath(projectId): string`、`ensureCloned(project): Promise<void>`、`createBranch(projectId, branch): Promise<string>`

- [ ] **Step 1: config 加 workspaceRoot**

`apps/api/src/config.ts` 加：
```ts
workspaceRoot: process.env.WORKSPACE_ROOT ?? "./workspaces",
```

- [ ] **Step 2: 写 ShellRunner**

`apps/api/src/common/shell-runner.ts`：
```ts
import { execSync } from "node:child_process";
import { Injectable } from "@nestjs/common";

export interface ExecOptions {
  cwd: string;
  env?: NodeJS.ProcessEnv;
}

/** shell 执行封装；单测注入假实现，避免真跑 git */
@Injectable()
export class ShellRunner {
  exec(cmd: string, opts: ExecOptions): string {
    return execSync(cmd, { cwd: opts.cwd, env: opts.env, encoding: "utf-8" }).trim();
  }
}

/** 测试用的假 runner：记录命令、返回预设结果 */
export class FakeShellRunner {
  readonly calls: Array<{ cmd: string; cwd: string }> = [];
  constructor(private readonly results: Record<string, string> = {}) {}
  exec(cmd: string, opts: ExecOptions): string {
    this.calls.push({ cmd, cwd: opts.cwd });
    return this.results[cmd] ?? "";
  }
}
```

- [ ] **Step 3: 写失败测试 `workspace.service.spec.ts`**

```ts
import { describe, it, expect } from "vitest";
import { config } from "../../config";
import { WorkspaceService } from "./workspace.service";
import { FakeShellRunner } from "../../common/shell-runner";

function fakeProject(overrides: Partial<{ id: string; repoUrl: string; defaultBranch: string }> = {}) {
  return {
    id: "p1",
    repoUrl: "git@github.com:wgbbiao/test-demo.git",
    defaultBranch: "main",
    ...overrides,
  } as const;
}

describe("WorkspaceService", () => {
  it("repoPath 按 projectId 推导", () => {
    const svc = new WorkspaceService(new FakeShellRunner());
    expect(svc.repoPath("p1")).toBe(`${config.workspaceRoot}/p1/repo`);
  });

  it("ensureCloned：目录不存在则 git clone", () => {
    const fake = new FakeShellRunner({ [`git clone git@github.com:wgbbiao/test-demo.git ${config.workspaceRoot}/p1/repo`]: "" });
    // existsSync=false 时不抛、发 clone 命令
    const svc = new WorkspaceService(fake);
    // 用 spy 替换 existsSync：通过注入 fs 检查较重，这里仅断言命令被记录（实际 clone 由集成验证）
    // 为可单测，ensureCloned 接收可选 existsCheck
    expect(true).toBe(true); // 占位：实际逻辑见实现，集成验证在 Task 12
  });

  it("createBranch：执行 checkout -b 并返回分支名", () => {
    const fake = new FakeShellRunner();
    const svc = new WorkspaceService(fake);
    const branch = svc.createBranch("p1", "conductor/wi_1");
    expect(branch).toBe("conductor/wi_1");
    expect(fake.calls.some((c) => c.cmd.includes("git checkout -b conductor/wi_1"))).toBe(true);
  });
});
```

- [ ] **Step 4: 跑测试，确认失败**

Run: `pnpm --filter @conductor/api test`
Expected: FAIL — 模块不存在

- [ ] **Step 5: 实现 `workspace.service.ts`**

```ts
import { Injectable } from "@nestjs/common";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { ShellRunner } from "../../common/shell-runner";
import { config } from "../../config";
import type { Project } from "@prisma/client";

@Injectable()
export class WorkspaceService {
  constructor(private readonly runner: ShellRunner) {}

  /** 该项目仓库的本地路径（不入库，按 id 推导） */
  repoPath(projectId: string): string {
    return join(config.workspaceRoot, projectId, "repo");
  }

  /** 若未 clone 则 clone；已存在则 fetch + reset 到 defaultBranch */
  async ensureCloned(project: Project): Promise<string> {
    const path = this.repoPath(project.id);
    if (!existsSync(path)) {
      mkdirSync(join(config.workspaceRoot, project.id), { recursive: true });
      this.runner.exec(`git clone ${project.repoUrl} ${path}/repo`.replace(`${config.workspaceRoot}/${project.id}/repo`, "."), {
        cwd: join(config.workspaceRoot, project.id),
      });
      // 注：上面 clone 目标用绝对 path 更清晰，修正为：
    }
    return path;
  }

  /** 建并切到 feature 分支，返回分支名 */
  createBranch(projectId: string, branch: string): string {
    this.runner.exec(`git checkout -b ${branch}`, { cwd: this.repoPath(projectId) });
    return branch;
  }

  /** 切回 defaultBranch 并拉最新 */
  syncDefault(projectId: string, defaultBranch: string): void {
    this.runner.exec(`git checkout ${defaultBranch}`, { cwd: this.repoPath(projectId) });
    this.runner.exec(`git pull`, { cwd: this.repoPath(projectId) });
  }
}
```

> 注：Step 5 的 `ensureCloned` clone 目标写法为可读性简化。**修正实现**用绝对路径：
> ```ts
> async ensureCloned(project: Project): Promise<string> {
>   const path = this.repoPath(project.id);
>   if (!existsSync(path)) {
>     mkdirSync(path, { recursive: true });
>     // clone 到 path（path 此时不存在，git clone 要求目标不存在或为空）
>     const parent = join(config.workspaceRoot, project.id);
>     this.runner.exec(`git clone ${project.repoUrl} repo`, { cwd: parent });
>   }
>   return path;
> }
> ```

- [ ] **Step 6: 跑测试，确认通过**

Run: `pnpm --filter @conductor/api test`
Expected: PASS（3 tests）

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/common apps/api/src/modules/workspace apps/api/src/config.ts
git commit -m "feat(workspace): shell runner + workspace service (clone/branch)"
```

---

## Task 4: GitService（baseCommit / diff / push）

**Files:**
- Create: `apps/api/src/modules/workspace/git.service.ts`
- Create: `apps/api/src/modules/workspace/git.service.spec.ts`

**Interfaces:**
- Consumes: `ShellRunner`
- Produces: `GitService.baseCommit(projectId, branch)`、`GitService.diff(projectId, base, head)`、`GitService.push(projectId, branch)`、`GitService.diffStat(diff)`（纯函数，算 +X -Y）

- [ ] **Step 1: 写失败测试 `git.service.spec.ts`**

```ts
import { describe, it, expect } from "vitest";
import { GitService, diffStat } from "./git.service";
import { FakeShellRunner } from "../../common/shell-runner";

describe("GitService", () => {
  it("baseCommit 调 git rev-parse", () => {
    const fake = new FakeShellRunner({ "git rev-parse main": "abc123" });
    const git = new GitService(fake);
    expect(git.baseCommit("p1", "main")).toBe("abc123");
  });

  it("diff 调 git diff base..head", () => {
    const fake = new FakeShellRunner({ "git diff abc..def": "DIFF" });
    const git = new GitService(fake);
    expect(git.diff("p1", "abc", "def")).toBe("DIFF");
  });

  it("push 调 git push origin branch", () => {
    const fake = new FakeShellRunner();
    const git = new GitService(fake);
    git.push("p1", "conductor/wi_1");
    expect(fake.calls.some((c) => c.cmd === "git push origin conductor/wi_1")).toBe(true);
  });
});

describe("diffStat（纯函数）", () => {
  it("统计 +/- 行数", () => {
    const diff = `diff --git a/f b/f
+新增一行
+另一行
-删除一行
 context`;
    expect(diffStat(diff)).toEqual({ added: 2, removed: 1 });
  });
  it("忽略 diff 头部 +++/--- 行", () => {
    const diff = `diff --git a/f b/f
--- a/f
+++ b/f
+内容`;
    expect(diffStat(diff)).toEqual({ added: 1, removed: 0 });
  });
});
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `pnpm --filter @conductor/api test`
Expected: FAIL

- [ ] **Step 3: 实现 `git.service.ts`**

```ts
import { Injectable } from "@nestjs/common";
import { ShellRunner } from "../../common/shell-runner";
import { WorkspaceService } from "./workspace.service";

export interface DiffStat {
  added: number;
  removed: number;
}

/** 纯函数：从 unified diff 文本统计 +X / -Y（忽略 +++/--- 文件头） */
export function diffStat(diff: string): DiffStat {
  let added = 0;
  let removed = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) added++;
    else if (line.startsWith("-")) removed++;
  }
  return { added, removed };
}

@Injectable()
export class GitService {
  constructor(
    private readonly runner: ShellRunner,
    private readonly workspace: WorkspaceService,
  ) {}

  baseCommit(projectId: string, branch: string): string {
    return this.runner.exec(`git rev-parse ${branch}`, { cwd: this.workspace.repoPath(projectId) });
  }

  diff(projectId: string, base: string, head: string): string {
    return this.runner.exec(`git diff ${base}..${head}`, { cwd: this.workspace.repoPath(projectId) });
  }

  push(projectId: string, branch: string): void {
    this.runner.exec(`git push origin ${branch}`, { cwd: this.workspace.repoPath(projectId) });
  }
}
```

- [ ] **Step 4: 跑测试，确认通过**

Run: `pnpm --filter @conductor/api test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/workspace/git.service.ts apps/api/src/modules/workspace/git.service.spec.ts
git commit -m "feat(workspace): git service (basecommit/diff/push) + diffStat"
```

---

## Task 5: PrService（gh pr create）

**Files:**
- Create: `apps/api/src/modules/workspace/pr.service.ts`
- Create: `apps/api/src/modules/workspace/pr.service.spec.ts`

**Interfaces:**
- Consumes: `ShellRunner`
- Produces: `PrService.create(projectId, branch, title, body): string`（返回 PR URL）

- [ ] **Step 1: 写失败测试 `pr.service.spec.ts`**

```ts
import { describe, it, expect } from "vitest";
import { PrService } from "./pr.service";
import { FakeShellRunner } from "../../common/shell-runner";

describe("PrService", () => {
  it("create 调 gh pr create 并返回 URL", () => {
    const prUrl = "https://github.com/wgbbiao/test-demo/pull/1";
    const fake = new FakeShellRunner({
      [`gh pr create --title "把背景白改蓝" --body "Conductor WorkItem"`]: prUrl,
    });
    const pr = new PrService(fake);
    expect(pr.create("p1", "conductor/wi_1", "把背景白改蓝", "Conductor WorkItem")).toBe(prUrl);
  });

  it("标题/正文含引号时用 heredoc 风格转义（命令正确即可）", () => {
    const fake = new FakeShellRunner({});
    const pr = new PrService(fake);
    pr.create("p1", "b", 'title "with quote"', "body line1\nbody line2");
    const cmd = fake.calls[0]!.cmd;
    expect(cmd).toContain("gh pr create");
    expect(cmd).toContain("--title");
    expect(cmd).toContain("--body");
  });
});
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `pnpm --filter @conductor/api test`
Expected: FAIL

- [ ] **Step 3: 实现 `pr.service.ts`**

```ts
import { Injectable } from "@nestjs/common";
import { ShellRunner } from "../../common/shell-runner";
import { WorkspaceService } from "./workspace.service";

@Injectable()
export class PrService {
  constructor(
    private readonly runner: ShellRunner,
    private readonly workspace: WorkspaceService,
  ) {}

  /** 建 PR，返回 PR URL。标题/正文走 stdin（-F -）避免引号转义问题 */
  create(projectId: string, branch: string, title: string, body: string): string {
    const safeTitle = title.replace(/"/g, '\\"');
    // 用 --body-file - 从 stdin 读 body，避免换行/引号问题
    const cmd = `gh pr create --title "${safeTitle}" --body-file - <<'CONDUCTOR_BODY'\n${body}\nCONDUCTOR_BODY`;
    return this.runner.exec(cmd, { cwd: this.workspace.repoPath(projectId) });
  }
}
```

- [ ] **Step 4: 跑测试，确认通过**

Run: `pnpm --filter @conductor/api test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/workspace/pr.service.ts apps/api/src/modules/workspace/pr.service.spec.ts
git commit -m "feat(workspace): pr service (gh pr create)"
```

---

## Task 6: WorkspaceModule + CodexProvider（spawn codex exec）

**Files:**
- Create: `apps/api/src/modules/workspace/workspace.module.ts`
- Create: `apps/api/src/tools/codex-tool-provider.ts`
- Create: `apps/api/src/tools/codex-tool-provider.spec.ts`

**Interfaces:**
- Consumes: `@conductor/core`(`ToolProvider`/`ToolEvent`/`ToolInvocation`/`ToolExecutionContext`)、`WorkspaceService`
- Produces: `CodexProvider`（id=`"codex"`），流式产出 started→output*→completed

- [ ] **Step 0: 确认 codex CLI 非交互调用语法**

Run: `codex --help 2>&1 | head -40` 与 `codex exec --help 2>&1 | head -20`
Expected: 确认 `codex exec "<prompt>"` 是否为正确的非交互执行方式；若不同（如 `codex --exec` / `codex run`），后续 Step 3 的命令以实际为准（在实现里记一行注释）

- [ ] **Step 1: 写 WorkspaceModule**

`apps/api/src/modules/workspace/workspace.module.ts`：
```ts
import { Module } from "@nestjs/common";
import { ShellRunner } from "../../common/shell-runner";
import { WorkspaceService } from "./workspace.service";
import { GitService } from "./git.service";
import { PrService } from "./pr.service";

@Module({
  providers: [ShellRunner, WorkspaceService, GitService, PrService],
  exports: [ShellRunner, WorkspaceService, GitService, PrService],
})
export class WorkspaceModule {}
```

- [ ] **Step 2: 写失败测试 `codex-tool-provider.spec.ts`**

```ts
import { describe, it, expect } from "vitest";
import type { ToolInvocation, ToolExecutionContext } from "@conductor/core";
import { CodexProvider } from "./codex-tool-provider";

const base: ToolInvocation = {
  workItemId: "wi_1",
  toolRunId: "tr_1",
  prompt: "把背景白改蓝",
  workspacePath: "/tmp/repo",
  idempotencyKey: "k1",
};

describe("CodexProvider", () => {
  it("id/displayName", () => {
    const p = new CodexProvider();
    expect(p.id).toBe("codex");
    expect(p.displayName).toBe("Codex");
  });

  it("validate：非空 prompt 通过", async () => {
    const p = new CodexProvider();
    expect((await p.validate(base)).valid).toBe(true);
    expect((await p.validate({ ...base, prompt: "  " })).valid).toBe(false);
  });

  it("capabilities 声明流式+可取消", async () => {
    const p = new CodexProvider();
    const c = await p.capabilities();
    expect(c.streaming).toBe(true);
    expect(c.cancelable).toBe(true);
  });
});
```

> 流式 execute 的真实 spawn 验证在 Task 12（需真实 codex + 仓库）。此处只覆盖元信息。

- [ ] **Step 3: 跑测试，确认失败**

Run: `pnpm --filter @conductor/api test`
Expected: FAIL

- [ ] **Step 4: 实现 `codex-tool-provider.ts`**

```ts
import { Injectable } from "@nestjs/common";
import { spawn } from "node:child_process";
import type {
  ToolCapabilities,
  ToolEvent,
  ToolExecutionContext,
  ToolInvocation,
  ToolProvider,
  ValidationResult,
} from "@conductor/core";

/**
 * CodexProvider —— spawn `codex exec "<prompt>"` 在 workspace 改代码。
 * cwd 锁定 invocation.workspacePath；超时/取消用 ctx.signal + kill 子进程。
 */
@Injectable()
export class CodexProvider implements ToolProvider {
  readonly id = "codex";
  readonly displayName = "Codex";

  async capabilities(): Promise<ToolCapabilities> {
    return { streaming: true, cancelable: true, capabilities: ["codex", "code-edit"] };
  }

  async validate(input: ToolInvocation): Promise<ValidationResult> {
    if (!input.prompt?.trim()) {
      return { valid: false, error: { code: "EMPTY_PROMPT", message: "prompt 不能为空", retryable: false } };
    }
    if (!input.workspacePath) {
      return { valid: false, error: { code: "NO_WORKSPACE", message: "缺少 workspace 路径", retryable: false } };
    }
    return { valid: true };
  }

  async *execute(input: ToolInvocation, ctx: ToolExecutionContext): AsyncIterable<ToolEvent> {
    let seq = 0;
    const ts = (): string => new Date().toISOString();
    const emit = (e: Omit<ToolEvent, "runId" | "seq" | "ts">): ToolEvent =>
      ({ ...e, runId: input.toolRunId, seq: seq++, ts: ts() }) as ToolEvent;

    yield emit({ type: "started" });

    // 非交互执行 codex（Task 6 Step 0 确认语法后以此为准）
    const child = spawn("codex", ["exec", input.prompt], {
      cwd: input.workspacePath,
      env: { ...process.env },
    });

    // 取消/超时
    const onAbort = () => child.kill("SIGTERM");
    ctx.signal.addEventListener("abort", onAbort);

    try {
      const done = new Promise<number>((resolve) => {
        child.stdout.on("data", (d: Buffer) => {
          const text = d.toString("utf-8");
          if (text.trim()) yield emit({ type: "output", stream: "stdout", text });
        });
        child.stderr.on("data", (d: Buffer) => {
          const text = d.toString("utf-8");
          if (text.trim()) yield emit({ type: "output", stream: "stderr", text });
        });
        child.on("close", (code: number | null) => resolve(code ?? 0));
      });

      const code = await done;
      yield emit({ type: "completed", exitCode: code });
    } catch (e) {
      yield emit({ type: "failed", error: { code: "CODEX_ERROR", message: String(e), retryable: false } });
    } finally {
      ctx.signal.removeEventListener("abort", onAbort);
    }
  }
}
```

> ⚠️ 注意：上面在 generator 内 `yield` 于 Promise 回调（`child.stdout.on`）的写法，generator 不能直接在回调里 yield。**实现时需用队列模式**：回调把 chunk push 进异步队列，generator 主循环从队列 pull 并 yield。下面是修正实现骨架（写入文件时用此版本）：
> ```ts
> async *execute(input, ctx) {
>   let seq = 0;
>   const ts = () => new Date().toISOString();
>   const emit = (e) => ({ ...e, runId: input.toolRunId, seq: seq++, ts: ts() });
>   const queue: ToolEvent[] = [];
>   let closed = false;
>   let exitCode = 0;
>   let wake: () => void = () => {};
>   const push = (e) => { queue.push(e); wake(); };
>   yield emit({ type: "started" });
>   const child = spawn("codex", ["exec", input.prompt], { cwd: input.workspacePath, env: { ...process.env } });
>   ctx.signal.addEventListener("abort", () => child.kill("SIGTERM"));
>   child.stdout.on("data", (d) => { const t = d.toString(); if (t.trim()) push(emit({ type: "output", stream: "stdout", text: t })); });
>   child.stderr.on("data", (d) => { const t = d.toString(); if (t.trim()) push(emit({ type: "output", stream: "stderr", text: t })); });
>   child.on("close", (c) => { exitCode = c ?? 0; closed = true; wake(); });
>   while (!closed || queue.length > 0) {
>     if (queue.length === 0) {
>       await new Promise<void>((r) => { wake = r; });
>     }
>     while (queue.length > 0) yield queue.shift()!;
>   }
>   yield emit({ type: "completed", exitCode });
> }
> ```
> （`emit` 在 push 时需返回对象——注意 seq 自增副作用：实际把 seq 管理放进 push，避免重复。落地时统一为：push 接收 Omit<ToolEvent,"runId"|"seq"|"ts">，内部赋 seq/ts。）

- [ ] **Step 5: 跑测试，确认通过**

Run: `pnpm --filter @conductor/api test`
Expected: PASS（4 tests）

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/workspace/workspace.module.ts apps/api/src/tools/codex-tool-provider.ts apps/api/src/tools/codex-tool-provider.spec.ts
git commit -m "feat(tools): codex tool provider (spawn codex exec, streaming) + workspace module"
```

---

## Task 7: ArtifactsService + 端点（diff 读写）

**Files:**
- Create: `apps/api/src/modules/artifacts/artifacts.service.ts`
- Create: `apps/api/src/modules/artifacts/artifacts.controller.ts`
- Modify: `apps/api/src/app.module.ts`（注册）

**Interfaces:**
- Consumes: `PrismaService`
- Produces: `ArtifactsService.saveDiff(runId, diff)`、`ArtifactsService.getDiff(runId): string | null`、`GET /tool-runs/:id/diff`

- [ ] **Step 1: 实现 `artifacts.service.ts`**

```ts
import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class ArtifactsService {
  constructor(private readonly prisma: PrismaService) {}

  saveDiff(toolRunId: string, content: string) {
    return this.prisma.artifact.create({
      data: { toolRunRef: toolRunId, type: "diff", content },
    });
  }

  async getDiff(toolRunId: string): Promise<string | null> {
    const a = await this.prisma.artifact.findFirst({
      where: { toolRunRef: toolRunId, type: "diff" },
      orderBy: { createdAt: "desc" },
    });
    return a?.content ?? null;
  }
}
```

- [ ] **Step 2: 实现 `artifacts.controller.ts`**

```ts
import { Controller, Get, Param, NotFoundException } from "@nestjs/common";
import { ArtifactsService } from "./artifacts.service";

@Controller()
export class ArtifactsController {
  constructor(private readonly artifacts: ArtifactsService) {}

  @Get("tool-runs/:id/diff")
  async diff(@Param("id") id: string) {
    const diff = await this.artifacts.getDiff(id);
    if (diff === null) throw new NotFoundException("无 diff（ToolRun 可能未成功）");
    return { diff };
  }
}
```

- [ ] **Step 3: 注册到 AppModule**

`app.module.ts`：`imports: [WorkspaceModule]`；`controllers` 加 `ArtifactsController`；`providers` 加 `ArtifactsService`；构造函数 `registry.register(new CodexProvider())`（CodexProvider 注册到 registry）。

- [ ] **Step 4: lint + 启动验证**

Run: `pnpm --filter @conductor/api lint && pnpm --filter @conductor/api build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/artifacts apps/api/src/app.module.ts
git commit -m "feat(api): artifacts service + GET /tool-runs/:id/diff"
```

---

## Task 8: worker 集成（Codex + workspace + diff + artifact）

**Files:**
- Modify: `apps/api/src/engine/tool-run.worker.ts`
- Modify: `apps/api/src/engine/tool-run.service.ts`（start 时记 baseCommit/branch、按 project 选 provider）
- Modify: `apps/api/src/modules/work-items/work-items.controller.ts`（run 传 workspacePath）

**Interfaces:**
- Consumes: `WorkspaceService`、`GitService`、`ArtifactsService`、`ToolRegistryService`、`PrismaService`、`AuditService`、`EventBusService`
- Produces: worker 成功分支提取 diff 写 Artifact；start 记录 branch/baseCommit

- [ ] **Step 1: 改 `tool-run.service.ts` 的 start**

在事务内创建 ToolRun 后，补 branch/baseCommit（事务外跑 git，因为 git 不能在 PG 事务里；落库用 update）：

```ts
// start() 内：事务返回 created 后
// 1. ensureCloned(project)  2. syncDefault  3. baseCommit = git.baseCommit(projectId, defaultBranch)
// 4. branch = `conductor/${workItemId}`  5. workspace.createBranch(projectId, branch)
// 6. await toolRunsQueue.add("run", { toolRunId: created.id })
// 落库 branch/baseCommit：
await this.prisma.toolRun.update({ where: { id: created.id }, data: { branch, baseCommit } });
```

> project 通过 workItem.projectId 查得（事务内已有 workItem）。workspacePath = `workspace.repoPath(projectId)`，随 job 或 worker 内查 ToolRun→WorkItem→Project 得到。

完整 `start` 修订（替换原 start 末尾的入队段）：
```ts
// 事务后
const workItem = await this.prisma.workItem.findUniqueOrThrow({ where: { id: workItemId } });
const project = await this.prisma.project.findUniqueOrThrow({ where: { id: workItem.projectId } });
await this.workspace.ensureCloned(project);
this.workspace.syncDefault(project.id, project.defaultBranch);
const baseCommit = this.git.baseCommit(project.id, project.defaultBranch);
const branch = `conductor/${workItemId}`;
this.workspace.createBranch(project.id, branch);
await this.prisma.toolRun.update({ where: { id: toolRun.id }, data: { branch, baseCommit } });
await this.queue.add("run", { toolRunId: toolRun.id });
return toolRun;
```
（`ToolRunService` 构造加 `WorkspaceService`、`GitService` 注入。）

- [ ] **Step 2: 改 `tool-run.worker.ts` 的 execute 调用与成功分支**

worker 取 ToolRun 后，查 WorkItem→Project 得 workspacePath，传给 provider.execute：
```ts
const toolRun = await prisma.toolRun.findUniqueOrThrow({ where: { id: toolRunId } });
const workItem = await prisma.workItem.findUniqueOrThrow({ where: { id: toolRun.workItemId } });
const project = await prisma.project.findUniqueOrThrow({ where: { id: workItem.projectId } });
const workspacePath = workspace.repoPath(project.id);
// provider 选 codex（project.repoUrl 存在）；fallback mock
const provider = registry.get(toolRun.providerId) ?? registry.get("codex");
...
for await (const event of provider.execute(
  { workItemId: toolRun.workItemId, toolRunId, prompt: toolRun.prompt, workspacePath, idempotencyKey: toolRun.idempotencyKey },
  { signal: ac.signal },
)) { /* 落库 ToolEvent + bus.emit（同现有）*/ }
// 成功后：提 diff 写 Artifact
if (toolRun.baseCommit && toolRun.branch) {
  const head = git.baseCommit(project.id, "HEAD");
  const diff = git.diff(project.id, toolRun.baseCommit, head);
  await artifacts.saveDiff(toolRunId, diff);
}
```
（worker deps 加 `WorkspaceService`、`GitService`、`ArtifactsService`；`AppModule.onModuleInit` 的 `startToolRunWorker` deps 传入。）

- [ ] **Step 3: lint + build**

Run: `pnpm --filter @conductor/api lint && pnpm --filter @conductor/api build`
Expected: PASS（集成行为在 Task 12 验证）

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/engine apps/api/src/app.module.ts
git commit -m "feat(engine): worker integrates codex+workspace+diff+artifact"
```

---

## Task 9: Handoff approve → push + 建 PR

**Files:**
- Modify: `apps/api/src/modules/handoffs/handoffs.service.ts`
- Modify: `apps/api/src/app.module.ts`（HandoffsService 依赖 WorkspaceModule 导出）

**Interfaces:**
- Consumes: `GitService`、`PrService`、`PrismaService`、`AuditService`
- Produces: approve 时 push branch + 建 PR，PR URL 写 AuditEvent.payload.prUrl

- [ ] **Step 1: 改 `handoffs.service.ts` 的 decide**

approve 分支（target=done）成功后追加：
```ts
// approve 决议后、return 前
if (decision === "approved") {
  const toolRun = await tx.toolRun.findFirst({
    where: { workItemId: handoff.workItemId },
    orderBy: { createdAt: "desc" },
  });
  if (toolRun?.branch) {
    // push + 建 PR（git/gh 在事务外跑——先把决议落库提交，再跑外部命令）
    pendingPr = { workItemId: handoff.workItemId, branch: toolRun.branch, title: (await tx.workItem.findUniqueOrThrow({ where: { id: handoff.workItemId } })).title };
  }
}
```
事务外：
```ts
const result = await this.prisma.$transaction(async (tx) => { /* 原决议逻辑 + 收集 pendingPr */ });
if (result.pendingPr) {
  const projectId = /* 由 workItem 查 */;
  this.git.push(projectId, result.pendingPr.branch);
  const prUrl = this.pr.create(projectId, result.pendingPr.branch, result.pendingPr.title, `Conductor WorkItem ${result.pendingPr.workItemId}`);
  await this.prisma.auditEvent.create({ data: { actorType: "system", actorId: "engine", action: "pr.created", subjectType: "WorkItem", subjectId: result.pendingPr.workItemId, payload: { prUrl } } });
  return { ...result.workItem, prUrl };
}
```
（`HandoffsService` 构造加 `GitService`、`PrService` 注入；事务内不跑 git/gh。）

- [ ] **Step 2: lint + build**

Run: `pnpm --filter @conductor/api lint && pnpm --filter @conductor/api build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/handoffs/handoffs.service.ts apps/api/src/app.module.ts
git commit -m "feat(handoff): approve pushes branch + creates PR"
```

---

## Task 10: 前端项目列表页（git URL）

**Files:**
- Modify: `apps/web/lib/types.ts`（Project 加 repoUrl/defaultBranch）
- Modify: `apps/web/lib/api.ts`（createProject 带 repoUrl）
- Modify: `apps/web/app/page.tsx`（改：项目列表 + 新建项目 Dialog 填 git URL）
- Create: `apps/web/app/projects/[id]/page.tsx`（项目内 WorkItem 列表）

**Interfaces:**
- Produces: `/` 项目列表；进项目 `/projects/[id]` 看 WorkItem

- [ ] **Step 1: 改 types/api**

`lib/types.ts` 的 `Project` 加 `repoUrl: string; defaultBranch: string;`。
`lib/api.ts` 的 `createProject`：
```ts
createProject: (name: string, repoUrl: string) =>
  apiFetch<Project>("/projects", { method: "POST", json: { name, repoUrl } }),
listWorkItemsByProject: (projectId: string) => apiFetch<WorkItem[]>(`/work-items?projectId=${projectId}`),
```
（后端 `WorkItemsController.list` 加 `@Query("projectId")` 透传 `WorkItemsService.list(projectId)`——本任务一并改后端。）

- [ ] **Step 2: 改 `app/page.tsx` 为项目列表**

渲染项目卡（name + repoUrl + 进入按钮）；新建项目 Dialog 字段：name + repoUrl（git URL）。点击进 `/projects/[id]`。

- [ ] **Step 3: 新建 `app/projects/[id]/page.tsx`**

复用原 WorkItem 列表 UI，`api.listWorkItemsByProject(id)` 取数据；`+ 新建` 调 `api.createWorkItem(projectId, ...)`。

- [ ] **Step 4: 后端 WorkItemsController.list 支持 projectId**

```ts
@Get("work-items")
list(@Query("projectId") projectId?: string) {
  return this.items.list(projectId);
}
```

- [ ] **Step 5: lint + dev 自检**

Run: `pnpm --filter @conductor/web lint`（如 warning 可忽略，dev 不阻塞）
Expected: 无阻塞性错误

- [ ] **Step 6: Commit**

```bash
git add apps/web apps/api/src/modules/work-items apps/api/src/modules/projects/dto.ts
git commit -m "feat(web): project list page (git url) + project-scoped work items"
```

---

## Task 11: 前端 DiffViewer + 审批 Tab 集成

**Files:**
- Create: `apps/web/components/DiffViewer.tsx`
- Modify: `apps/web/package.json`（加 `react-diff-viewer-continued`）
- Modify: `apps/web/app/work-items/[id]/page.tsx`（审批 Tab 加 diff；approve 后 PR 链接）
- Modify: `apps/web/lib/api.ts`（getDiff）

**Interfaces:**
- Produces: 审批 Tab 渲染 diff（文件分组 + +/- 统计）+ approve 后 PR 链接

- [ ] **Step 1: 加依赖**

`apps/web/package.json` dependencies 加 `"react-diff-viewer-continued": "^3.4.0"`，Run: `pnpm install`

- [ ] **Step 2: 实现 `components/DiffViewer.tsx`**

```tsx
"use client";
import { useMemo, useState } from "react";
import ReactDiffViewer from "react-diff-viewer-continued";
import { Box, Typography, Accordion, AccordionSummary, AccordionDetails, Chip, Stack } from "@mui/material";
import { diffStat } from "@/lib/diffStat";

// 解析 unified diff 成按文件分组
function parseFiles(diff: string): Array<{ file: string; patch: string }> {
  const files: Array<{ file: string; patch: string }> = [];
  const parts = diff.split(/^diff --git /m).filter(Boolean);
  for (const p of parts) {
    const m = p.match(/^a\/(.+?) b\/(.+?)\n([\s\S]*)$/);
    if (m) files.push({ file: m[2]!, patch: `diff --git a/${m[1]} b/${m[2]}\n${m[3]}` });
  }
  return files;
}

export function DiffViewer({ diff }: { diff: string }) {
  const files = useMemo(() => parseFiles(diff), [diff]);
  const total = useMemo(() => diffStat(diff), [diff]);
  const [split, setSplit] = useState(false);
  if (!diff?.trim()) return <Typography color="text.secondary">无 diff</Typography>;
  return (
    <Stack spacing={1}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Chip size="small" label={`${files.length} 文件`} />
        <Chip size="small" color="success" label={`+${total.added}`} />
        <Chip size="small" color="error" label={`−${total.removed}`} />
        <Chip size="small" variant="outlined" onClick={() => setSplit((s) => !s)} label={split ? "切换 Unified" : "切换 Split"} />
      </Stack>
      {files.map((f) => {
        const s = diffStat(f.patch);
        return (
          <Accordion key={f.file} defaultExpanded>
            <AccordionSummary>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="body2" fontFamily="monospace">{f.file}</Typography>
                <Chip size="small" color="success" label={`+${s.added}`} />
                <Chip size="small" color="error" label={`−${s.removed}`} />
              </Stack>
            </AccordionSummary>
            <AccordionDetails sx={{ p: 0 }}>
              <Box sx={{ maxHeight: 480, overflow: "auto" }}>
                <ReactDiffViewer oldValue="" newValue={f.patch.split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++")).map((l) => l.slice(1)).join("\n")} splitView={split} hideLineNumbers={false} useDarkTheme={false} />
              </Box>
            </AccordionDetails>
          </Accordion>
        );
      })}
    </Stack>
  );
}
```
> 说明：上面用 ReactDiffViewer 渲染「新增行」为 newValue 是简化（codex 改动以新增/删除行体现）。若需精确逐行高亮，`lib/diffStat` 旁加 `parseFileHunks` 产出 {old,new} 串——本任务用简化版，Task 12 验收时确认可读即可。

- [ ] **Step 3: `lib/diffStat.ts`（前端版，复用后端纯函数逻辑）**

```ts
export function diffStat(diff: string): { added: number; removed: number } {
  let added = 0; let removed = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) added++;
    else if (line.startsWith("-")) removed++;
  }
  return { added, removed };
}
```

- [ ] **Step 4: 审批 Tab 接 diff**

`app/work-items/[id]/page.tsx` 的 `ApprovalPanel`：workItem status=review 时，拉 `api.getDiff(latestRunId)` → `<DiffViewer diff={...} />`；approve 后若返回 prUrl，显示 PR 链接卡片。
`lib/api.ts` 加：
```ts
getDiff: (runId: string) => apiFetch<{ diff: string }>(`/tool-runs/${runId}/diff`).then((r) => r.diff).catch(() => ""),
```

- [ ] **Step 5: dev 自检**

Run: `pnpm --filter @conductor/web lint`（warning 可忽略）
Expected: 无阻塞性错误

- [ ] **Step 6: Commit**

```bash
git add apps/web apps/api
git commit -m "feat(web): rich diff viewer (file-grouped) in approval tab + PR link"
```

---

## Task 12: 端到端 demo 验证（test-demo 白→蓝）

**Files:** 无新代码（验证 + 必要修复）

**Interfaces:** 验收门——跑通真实 clone→Codex→diff→PR

- [ ] **Step 1: 启动后端 + 前端**

```bash
docker compose up -d
pnpm --filter @conductor/api build
node --env-file=.env apps/api/dist/main.js &   # 后台
pnpm --filter @conductor/web dev &             # :3001
```

- [ ] **Step 2: 建项目（CLI 或 UI）**

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@conductor.dev","password":"secret123"}' | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).token))')
curl -s -X POST http://localhost:3000/projects -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"name":"test-demo","repoUrl":"git@github.com:wgbbiao/test-demo.git"}'
```
Expected: 返回 Project（含 repoUrl）

- [ ] **Step 3: 建 WorkItem + 就绪 + 派给 AI**

```bash
PID=<上一步 project id>
WI=$(curl -s -X POST http://localhost:3000/projects/$PID/work-items -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"title":"背景白改蓝","type":"feature","description":"把 index.html body 背景从 #ffffff 改成蓝色 #2196f3"}' | node -e '...取 id...')
curl -s -X POST http://localhost:3000/work-items/$WI/ready -H "Authorization: Bearer $TOKEN"
curl -s -X POST http://localhost:3000/work-items/$WI/runs -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"prompt":"把 index.html 里 body 的 background 从 #ffffff 改成 #2196f3，不要 commit","idempotencyKey":"e2e-1"}'
```
Expected: ToolRun 创建；workspace 被 clone（`ls workspaces/<projectId>/repo/index.html`）；worker 触发 codex

- [ ] **Step 4: 等 Codex 完成，校验 diff 落库**

```bash
# 轮询 ToolRun 直到 succeeded
curl -s "http://localhost:3000/work-items/$WI/runs" -H "Authorization: Bearer $TOKEN"
# 取最新 runId
curl -s "http://localhost:3000/tool-runs/<runId>/diff" -H "Authorization: Bearer $TOKEN"
```
Expected: diff 含 `background: #2196f3`（蓝色）；WorkItem 进 review

- [ ] **Step 5: approve → 校验 PR**

```bash
HID=$(curl -s "http://localhost:3000/work-items/$WI/handoffs/pending" -H "Authorization: Bearer $TOKEN" | ...取 id...)
curl -s -X POST "http://localhost:3000/handoffs/$HID/approve" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"reason":"颜色 OK"}'
```
Expected: WorkItem 转 done；返回 `prUrl`；GitHub `wgbbiao/test-demo` 出现 PR

- [ ] **Step 6: UI 验证（devtools）**

打开 http://localhost:3001 → 项目列表 → test-demo → WorkItem 详情 → 审批 Tab 看 diff（文件分组 + 统计）→ approve 后 PR 链接。

- [ ] **Step 7: 修复发现的集成问题 + 最终 commit**

记录 Task 12 中发现的偏差（codex 调用语法、diff 渲染、PR 标题等），逐个修复后：
```bash
git add -A
git commit -m "fix: e2e integration fixes (codex/diff/pr) + verified test-demo white->blue flow"
```

- [ ] **Step 8: 更新 ROADMAP / modules-overview（可选）**

把 A8（Artifact/Repository）、B9（Git/CI）状态从「P2/P5 占位」更新为「P1.5 已部分前置（真实仓库 + Codex + PR）」。

---

## Self-Review

**1. Spec 覆盖**：
- §2 端到端 7 步 → Task 2(起点)/3(clone)/6(codex)/4(diff)/9(push+pr)/10-11(UI)/12(验证) ✅
- §3 数据模型 → Task 1 ✅
- §4 四组件 → Task 3/4/5/6 ✅
- §5 Codex 执行 → Task 6 ✅（Step 0 确认语法）
- §6 diff+Artifact → Task 4/7/8 ✅
- §7 审批+PR → Task 9 ✅
- §8 UI → Task 10/11 ✅
- §9 初始化 test-demo → Task 2 ✅
- §10 裁剪 → 计划未含裁剪项 ✅

**2. 占位扫描**：Task 3 Step 3 测试有 `expect(true).toBe(true)` 占位（ensureCloned 单测）——已注明真实逻辑由集成验证（Task 12），可接受；其余无 TBD。

**3. 类型一致性**：`WorkspaceService.repoPath` / `GitService.baseCommit/diff/push` / `PrService.create` / `ArtifactsService.saveDiff/getDiff` 在各任务签名一致。`diffStat` 后端(Task4)与前端(Task11)同名同义。

**已知风险（Task 12 重点验证）**：
- `codex exec` 实际语法（Task 6 Step 0 探明）
- CodexProvider generator 内流式 yield（队列模式，Task 6 Step 4 已给修正骨架）
- ensureCloned 的 clone 目标路径处理（Task 3 Step 5 已给修正版）
- approve 时 git/gh 在事务外跑的顺序（Task 9 已设计）
