export type WorkItemType = "bug" | "feature" | "task";
export type WorkItemStatus = "draft" | "ready" | "running" | "review" | "done" | "failed";
export type ToolRunStatus = "queued" | "running" | "succeeded" | "failed" | "canceled";
export type HandoffStatus = "pending" | "approved" | "rejected";

export interface Project {
  id: string;
  name: string;
  description: string;
  repoUrl: string;
  defaultBranch: string;
  createdAt: string;
}

export interface WorkItem {
  id: string;
  projectId: string;
  type: WorkItemType;
  title: string;
  description: string;
  status: WorkItemStatus;
  currentToolRunId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ToolRun {
  id: string;
  workItemId: string;
  providerId: string;
  status: ToolRunStatus;
  prompt: string;
  exitCode: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

export interface ToolEvent {
  type: "started" | "output" | "artifact" | "completed" | "failed";
  runId: string;
  seq: number;
  ts: string;
  stream?: "stdout" | "stderr";
  text?: string;
  exitCode?: number;
  error?: { code: string; message: string };
}

export interface Handoff {
  id: string;
  workItemId: string;
  fromStatus: WorkItemStatus;
  toStatus: WorkItemStatus;
  status: HandoffStatus;
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  actorType: "user" | "system" | "tool";
  actorId: string;
  action: string;
  subjectType: string;
  subjectId: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface User {
  id: string;
  email: string;
  displayName: string;
  role: string;
}
