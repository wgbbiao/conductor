import { existsSync, mkdirSync } from "node:fs";
import { Injectable, Optional } from "@nestjs/common";
import type { Project } from "@prisma/client";
import { ShellRunner } from "../../common/shell-runner";
import { config } from "../../config";

type FsLike = {
  existsSync(path: string): boolean;
  mkdirSync(path: string, opts: { recursive: boolean }): void;
};

@Injectable()
export class WorkspaceService {
  private readonly fs: FsLike;

  constructor(
    private readonly runner: ShellRunner,
    @Optional() fs?: FsLike,
  ) {
    this.fs = fs ?? { existsSync, mkdirSync };
  }

  repoPath(projectId: string): string {
    return `${config.workspaceRoot}/${projectId}/repo`;
  }

  async ensureCloned(project: Pick<Project, "id" | "repoUrl">): Promise<void> {
    const workspacePath = `${config.workspaceRoot}/${project.id}`;
    if (this.fs.existsSync(this.repoPath(project.id))) {
      return;
    }

    this.fs.mkdirSync(workspacePath, { recursive: true });
    this.runner.run("git", ["clone", project.repoUrl, "repo"], { cwd: workspacePath });
  }

  createBranch(projectId: string, branch: string): string {
    this.runner.run("git", ["checkout", "-b", branch], { cwd: this.repoPath(projectId) });
    return branch;
  }

  syncDefault(projectId: string, defaultBranch: string): void {
    const cwd = this.repoPath(projectId);
    this.runner.run("git", ["fetch", "origin", defaultBranch], { cwd });
    this.runner.run("git", ["checkout", defaultBranch], { cwd });
    this.runner.run("git", ["reset", "--hard", `origin/${defaultBranch}`], { cwd });
  }
}
