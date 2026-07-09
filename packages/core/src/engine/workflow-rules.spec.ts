import { describe, it, expect } from "vitest";
import { defaultWorkflowDefinition, canTransition, findTransition, nextStatuses } from "./workflow-rules.js";

describe("workflow rules", () => {
  const def = defaultWorkflowDefinition;

  it("draft -> ready 合法且无需审批", () => {
    expect(canTransition(def, "draft", "ready")).toBe(true);
    expect(findTransition(def, "draft", "ready")?.requiresApproval).toBe(false);
  });

  it("ready -> running 合法", () => {
    expect(canTransition(def, "ready", "running")).toBe(true);
  });

  it("running -> review 需要审批", () => {
    expect(canTransition(def, "running", "review")).toBe(true);
    expect(findTransition(def, "running", "review")?.requiresApproval).toBe(true);
  });

  it("draft -> done 非法", () => {
    expect(canTransition(def, "draft", "done")).toBe(false);
  });

  it("running -> failed 合法", () => {
    expect(canTransition(def, "running", "failed")).toBe(true);
  });

  it("nextStatuses 返回从某状态可达的全部目标", () => {
    expect(nextStatuses(def, "running").sort()).toEqual(["done", "failed", "review"]);
  });
});
