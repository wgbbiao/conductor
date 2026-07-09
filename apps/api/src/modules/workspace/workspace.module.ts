import { Module } from "@nestjs/common";
import { ShellRunner } from "../../common/shell-runner";
import { GitService } from "./git.service";
import { PrService } from "./pr.service";
import { WorkspaceService } from "./workspace.service";

@Module({
  providers: [ShellRunner, WorkspaceService, GitService, PrService],
  exports: [ShellRunner, WorkspaceService, GitService, PrService],
})
export class WorkspaceModule {}
