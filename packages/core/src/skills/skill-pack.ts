/**
 * SkillPackLoader —— Skills 生态适配契约（第二个扩展点）。
 * Phase 1 仅 detect/load manifest，不执行任意 skill 脚本。
 */

export type SkillPackSource =
  | { kind: "local"; path: string }
  | { kind: "git"; url: string };

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
}

export interface SkillPackManifest {
  id: string;
  name: string;
  version: string;
  sourceType: "openspec" | "superpowers" | "gstack" | "custom";
  skills: SkillDefinition[];
  workflows?: { name: string; ref: string }[];
  conflicts?: string[];
}

export interface SkillLoadContext {
  logger?: { info: (m: string) => void };
}

/** Skills 生态适配契约 —— Phase 1 仅 detect/load manifest，不执行脚本 */
export interface SkillPackLoader {
  readonly id: string;
  detect(source: SkillPackSource): Promise<boolean>;
  load(source: SkillPackSource, ctx: SkillLoadContext): Promise<SkillPackManifest>;
}
