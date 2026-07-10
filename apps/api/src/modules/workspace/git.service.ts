import { Injectable } from "@nestjs/common";
import { ShellRunner } from "../../common/shell-runner";
import { WorkspaceService } from "./workspace.service";

export type DiffStat = {
  added: number;
  removed: number;
};

export function diffStat(diff: string): DiffStat {
  let added = 0;
  let removed = 0;

  for (const line of diff.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---")) {
      continue;
    }
    if (line.startsWith("+")) {
      added += 1;
      continue;
    }
    if (line.startsWith("-")) {
      removed += 1;
    }
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
    return this.runner.run("git", ["rev-parse", branch], {
      cwd: this.workspace.repoPath(projectId),
    });
  }

  diff(projectId: string, base: string): string {
    return this.runner.run("git", ["diff", base], {
      cwd: this.workspace.repoPath(projectId),
    });
  }

  commit(projectId: string, message: string): void {
    const cwd = this.workspace.repoPath(projectId);
    this.runner.run("git", ["add", "-A"], { cwd });
    this.runner.run("git", ["commit", "-m", message], { cwd });
  }

  push(projectId: string, branch: string): void {
    this.runner.run("git", ["push", "origin", branch], {
      cwd: this.workspace.repoPath(projectId),
    });
  }
}
