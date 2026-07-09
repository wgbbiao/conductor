import { describe, expect, it } from "vitest";
import { config } from "../../config";
import { FakeShellRunner } from "../../common/shell-runner";
import { WorkspaceService } from "./workspace.service";

function fakeProject(overrides: Partial<{ id: string; repoUrl: string; defaultBranch: string }> = {}) {
  return {
    id: "p1",
    repoUrl: "git@github.com:wgbbiao/test-demo.git",
    defaultBranch: "main",
    ...overrides,
  } as const;
}

function fakeFs(exists: boolean) {
  const mkdirCalls: Array<{ path: string; recursive?: boolean }> = [];
  return {
    fs: {
      existsSync: () => exists,
      mkdirSync: (path: string, opts?: { recursive?: boolean }) => {
        mkdirCalls.push({ path, recursive: opts?.recursive });
      },
    },
    mkdirCalls,
  };
}

describe("WorkspaceService", () => {
  it("repoPath 按 projectId 推导", () => {
    const svc = new WorkspaceService(new FakeShellRunner());
    expect(svc.repoPath("p1")).toBe(`${config.workspaceRoot}/p1/repo`);
  });

  it("ensureCloned：目录不存在则创建父目录并 git clone", async () => {
    const fake = new FakeShellRunner();
    const { fs, mkdirCalls } = fakeFs(false);
    const svc = new WorkspaceService(fake, fs);

    await svc.ensureCloned(fakeProject());

    expect(mkdirCalls).toEqual([{ path: `${config.workspaceRoot}/p1`, recursive: true }]);
    expect(fake.calls).toEqual([
      {
        command: "git",
        args: ["clone", "git@github.com:wgbbiao/test-demo.git", "repo"],
        cwd: `${config.workspaceRoot}/p1`,
      },
    ]);
  });

  it("ensureCloned：目录已存在则跳过 clone", async () => {
    const fake = new FakeShellRunner();
    const { fs, mkdirCalls } = fakeFs(true);
    const svc = new WorkspaceService(fake, fs);

    await svc.ensureCloned(fakeProject());

    expect(mkdirCalls).toEqual([]);
    expect(fake.calls).toEqual([]);
  });

  it("createBranch：执行 checkout -b 并返回分支名", () => {
    const fake = new FakeShellRunner();
    const svc = new WorkspaceService(fake);

    const branch = svc.createBranch("p1", "conductor/wi_1");

    expect(branch).toBe("conductor/wi_1");
    expect(fake.calls).toEqual([
      {
        command: "git",
        args: ["checkout", "-b", "conductor/wi_1"],
        cwd: `${config.workspaceRoot}/p1/repo`,
      },
    ]);
  });
});
