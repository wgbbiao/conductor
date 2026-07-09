import { execFileSync } from "node:child_process";
import { Injectable } from "@nestjs/common";

export type ShellCommand = "git" | "gh" | "codex";

export interface ExecOptions {
  cwd: string;
  env?: NodeJS.ProcessEnv;
}

function callKey(command: ShellCommand, args: readonly string[]): string {
  return [command, ...args].join("\0");
}

@Injectable()
export class ShellRunner {
  run(command: ShellCommand, args: readonly string[], opts: ExecOptions): string {
    return execFileSync(command, [...args], { cwd: opts.cwd, env: opts.env, encoding: "utf8" }).trim();
  }
}

export class FakeShellRunner {
  readonly calls: Array<{ command: ShellCommand; args: string[]; cwd: string }> = [];

  constructor(private readonly results: Record<string, string> = {}) {}

  run(command: ShellCommand, args: readonly string[], opts: ExecOptions): string {
    const call = { command, args: [...args], cwd: opts.cwd };
    this.calls.push(call);
    return this.results[callKey(command, args)] ?? "";
  }
}
