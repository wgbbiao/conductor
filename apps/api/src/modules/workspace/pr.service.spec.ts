import { describe, expect, it } from "vitest";
import { FakeShellRunner } from "../../common/shell-runner";
import { WorkspaceService } from "./workspace.service";
import { PrService } from "./pr.service";

function ghCallKey(...args: string[]) {
  return ["gh", ...args].join("\0");
}

describe("PrService", () => {
  it("create：执行 gh pr create 并返回 PR URL", () => {
    const prUrl = "https://github.com/wgbbiao/test-demo/pull/1";
    const runner = new FakeShellRunner({
      [ghCallKey("pr", "create", "--title", "把背景白改蓝", "--body", "Conductor WorkItem", "--head", "conductor/wi_1")]:
        prUrl,
    });
    const workspace = new WorkspaceService(new FakeShellRunner());
    const service = new PrService(runner, workspace);

    expect(service.create("p1", "conductor/wi_1", "把背景白改蓝", "Conductor WorkItem")).toBe(prUrl);
    expect(runner.calls).toEqual([
      {
        command: "gh",
        args: ["pr", "create", "--title", "把背景白改蓝", "--body", "Conductor WorkItem", "--head", "conductor/wi_1"],
        cwd: workspace.repoPath("p1"),
      },
    ]);
  });

  it("create：标题和正文原样作为单个参数传递", () => {
    const runner = new FakeShellRunner();
    const workspace = new WorkspaceService(new FakeShellRunner());
    const service = new PrService(runner, workspace);

    service.create("p1", "branch", 'title "with quote"', 'body line1\nbody "line2"');

    expect(runner.calls).toEqual([
      {
        command: "gh",
        args: ["pr", "create", "--title", 'title "with quote"', "--body", 'body line1\nbody "line2"', "--head", "branch"],
        cwd: workspace.repoPath("p1"),
      },
    ]);
  });
});
