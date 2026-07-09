import { clearToken, getToken } from "./auth";
import type { AuditEvent, Handoff, Project, ToolEvent, ToolRun, User, WorkItem } from "./types";

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

interface FetchOpts extends RequestInit {
  json?: unknown;
}

/** 统一 fetch：自动带 Bearer token、JSON body；401 自动跳登录 */
async function apiFetch<T>(path: string, opts: FetchOpts = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (opts.json !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (token) headers["Authorization"] = `Bearer ${token}`;
  Object.assign(headers, opts.headers as Record<string, string> | undefined);

  const res = await fetch(`${API_URL}${path}`, {
    ...opts,
    headers,
    body: opts.json !== undefined ? JSON.stringify(opts.json) : opts.body,
  });

  if (res.status === 401 && typeof window !== "undefined") {
    clearToken();
    window.location.href = "/login";
    throw new Error("未登录或登录已过期");
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText} ${text}`.trim());
  }
  return res.json() as Promise<T>;
}

export const api = {
  // auth
  login: (email: string, password: string) =>
    apiFetch<{ token: string; user: User }>("/auth/login", { method: "POST", json: { email, password } }),
  me: () => apiFetch<User>("/me"),

  // projects
  listProjects: () => apiFetch<Project[]>("/projects"),
  createProject: (name: string) => apiFetch<Project>("/projects", { method: "POST", json: { name } }),

  // work items
  listWorkItems: () => apiFetch<WorkItem[]>("/work-items"),
  createWorkItem: (projectId: string, data: { title: string; type: WorkItem["type"]; description?: string }) =>
    apiFetch<WorkItem>(`/projects/${projectId}/work-items`, { method: "POST", json: data }),
  getWorkItem: (id: string) => apiFetch<WorkItem>(`/work-items/${id}`),
  markReady: (id: string) => apiFetch<WorkItem>(`/work-items/${id}/ready`, { method: "POST" }),

  // runs
  startRun: (id: string, prompt: string, idempotencyKey: string) =>
    apiFetch<ToolRun>(`/work-items/${id}/runs`, { method: "POST", json: { prompt, idempotencyKey } }),
  listRuns: (workItemId: string) => apiFetch<ToolRun[]>(`/work-items/${workItemId}/runs`),
  getEvents: (runId: string) => apiFetch<ToolEvent[]>(`/tool-runs/${runId}/events`),

  // handoffs
  getPendingHandoff: (workItemId: string) => apiFetch<Handoff>(`/work-items/${workItemId}/handoffs/pending`),
  approve: (id: string, reason?: string) => apiFetch(`/handoffs/${id}/approve`, { method: "POST", json: { reason } }),
  reject: (id: string, reason?: string) => apiFetch(`/handoffs/${id}/reject`, { method: "POST", json: { reason } }),

  // audit
  listAudits: (subjectId: string) =>
    apiFetch<AuditEvent[]>(`/audit-events?subjectId=${subjectId}`).catch(() => [] as AuditEvent[]),
};
