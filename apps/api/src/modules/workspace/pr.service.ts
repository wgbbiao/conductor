import { Injectable } from "@nestjs/common";
import type { ShellRunner } from "../../common/shell-runner";
import { WorkspaceService } from "./workspace.service";

@Injectable()
export class PrService {
  constructor(
    private readonly runner: Pick<ShellRunner, "run">,
    private readonly workspace: WorkspaceService,
  ) {}

  create(projectId: string, branch: string, title: string, body: string): string {
    return this.runner.run("gh", ["pr", "create", "--title", title, "--body", body, "--head", branch], {
      cwd: this.workspace.repoPath(projectId),
    });
  }
}
