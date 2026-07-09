import { describe, expect, it } from "vitest";
import { FakeShellRunner } from "../../common/shell-runner";
import { WorkspaceService } from "./workspace.service";
import { GitService, diffStat } from "./git.service";

function gitCallKey(...args: string[]) {
  return ["git", ...args].join("\0");
}

describe("GitService", () => {
  it("baseCommit：执行 rev-parse 并返回 commit", () => {
    const runner = new FakeShellRunner({
      [gitCallKey("rev-parse", "main")]: "abc123",
    });
    const workspace = new WorkspaceService(new FakeShellRunner());
    const service = new GitService(runner, workspace);

    expect(service.baseCommit("p1", "main")).toBe("abc123");
    expect(runner.calls).toEqual([
      {
        command: "git",
        args: ["rev-parse", "main"],
        cwd: workspace.repoPath("p1"),
      },
    ]);
  });

  it("diff：执行 git diff base..head 并返回 diff 文本", () => {
    const runner = new FakeShellRunner({
      [gitCallKey("diff", "abc..def")]: "DIFF",
    });
    const workspace = new WorkspaceService(new FakeShellRunner());
    const service = new GitService(runner, workspace);

    expect(service.diff("p1", "abc", "def")).toBe("DIFF");
    expect(runner.calls).toEqual([
      {
        command: "git",
        args: ["diff", "abc..def"],
        cwd: workspace.repoPath("p1"),
      },
    ]);
  });

  it("push：执行 git push origin branch", () => {
    const runner = new FakeShellRunner();
    const workspace = new WorkspaceService(new FakeShellRunner());
    const service = new GitService(runner, workspace);

    service.push("p1", "conductor/wi_1");

    expect(runner.calls).toEqual([
      {
        command: "git",
        args: ["push", "origin", "conductor/wi_1"],
        cwd: workspace.repoPath("p1"),
      },
    ]);
  });
});

describe("diffStat", () => {
  it("统计新增和删除行", () => {
    const diff = `diff --git a/f b/f
+新增一行
+另一行
-删除一行
 context`;

    expect(diffStat(diff)).toEqual({ added: 2, removed: 1 });
  });

  it("忽略文件头部的 +++/---", () => {
    const diff = `diff --git a/f b/f
--- a/f
+++ b/f
+内容`;

    expect(diffStat(diff)).toEqual({ added: 1, removed: 0 });
  });
});
