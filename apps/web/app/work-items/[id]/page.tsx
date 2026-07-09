"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { io } from "socket.io-client";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  List,
  ListItem,
  ListItemText,
  Paper,
  Snackbar,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { TopAppBar } from "@/components/AppBar";
import { DiffViewer } from "@/components/DiffViewer";
import { WorkItemStatusChip, WorkItemTypeChip } from "@/components/StatusChip";
import { API_URL, api } from "@/lib/api";
import { getToken } from "@/lib/auth";
import type { AuditEvent, Handoff, ToolEvent, ToolRun, WorkItem } from "@/lib/types";

export default function WorkItemDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();

  const [wi, setWi] = useState<WorkItem | null>(null);
  const [runs, setRuns] = useState<ToolRun[]>([]);
  const [handoff, setHandoff] = useState<Handoff | null>(null);
  const [tab, setTab] = useState(0);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");

  const reload = async () => {
    const [w, rs] = await Promise.all([api.getWorkItem(id), api.listRuns(id)]);
    setWi(w);
    setRuns(rs);
    if (w.status === "review") {
      try {
        setHandoff(await api.getPendingHandoff(id));
      } catch {
        setHandoff(null);
      }
    } else {
      setHandoff(null);
    }
  };

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    reload().catch((e) => setError(String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // review 时自动跳审批 Tab
  useEffect(() => {
    if (wi?.status === "review") setTab(2);
  }, [wi?.status]);

  const markReady = async () => {
    await api.markReady(id);
    await reload();
    setToast("已标记就绪");
  };

  const dispatchToAI = async () => {
    const run = await api.startRun(id, `处理工作项：${wi?.title ?? ""}`, crypto.randomUUID());
    setTab(1);
    setToast("已派给 AI");
    await reload();
    return run;
  };

  if (error) {
    return (
      <>
        <TopAppBar back />
        <Box p={3}>
          <Alert severity="error">{error}</Alert>
        </Box>
      </>
    );
  }

  if (!wi) {
    return (
      <>
        <TopAppBar back />
        <Box p={3}>
          <CircularProgress />
        </Box>
      </>
    );
  }

  const latestRun = runs[0] ?? null;

  return (
    <>
      <TopAppBar back />
      <Box sx={{ maxWidth: 1000, mx: "auto", p: 3 }}>
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
          <WorkItemTypeChip type={wi.type} />
          <Typography variant="h5" sx={{ flex: 1 }}>
            {wi.title}
          </Typography>
          <WorkItemStatusChip status={wi.status} />
        </Stack>

        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ borderBottom: 1, borderColor: "divider", mb: 2 }}>
          <Tab label="概览" />
          <Tab label="运行" />
          <Tab label={wi.status === "review" ? `审批 ●` : "审批"} />
          <Tab label="审计" />
        </Tabs>

        {tab === 0 && (
          <Stack spacing={2}>
            <Typography variant="body1" color="text.secondary">
              {wi.description || "（无描述）"}
            </Typography>
            {wi.status === "draft" && (
              <Button variant="contained" onClick={markReady}>
                标记就绪
              </Button>
            )}
            {wi.status === "ready" && (
              <Button variant="contained" onClick={dispatchToAI}>
                🤖 派给 AI
              </Button>
            )}
          </Stack>
        )}

        {tab === 1 && (
          <RunPanel run={latestRun} wi={wi} onDispatch={dispatchToAI} onStatusChange={reload} />
        )}

        {tab === 2 && (
          <ApprovalPanel
            handoff={handoff}
            latestRunId={latestRun?.id ?? wi.currentToolRunId}
            wiStatus={wi.status}
            onDecided={reload}
            setToast={setToast}
          />
        )}

        {tab === 3 && <AuditPanel workItemId={id} />}
      </Box>

      <Snackbar open={!!toast} autoHideDuration={2000} onClose={() => setToast("")}>
        <Alert severity="success">{toast}</Alert>
      </Snackbar>
    </>
  );
}

/** 运行 Tab：实时日志（socket.io） */
function RunPanel({
  run,
  wi,
  onDispatch,
  onStatusChange,
}: {
  run: ToolRun | null;
  wi: WorkItem;
  onDispatch: () => Promise<ToolRun>;
  onStatusChange: () => Promise<void>;
}) {
  const [events, setEvents] = useState<ToolEvent[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!run) return;
    let disposed = false;
    setEvents([]);
    (async () => {
      try {
        const initial = await api.getEvents(run.id);
        if (!disposed) setEvents(initial);
      } catch {
        /* run 可能还没事件 */
      }
    })();
    const sock = io(API_URL);
    sock.on("connect", () => sock.emit("subscribe", { runId: run.id }));
    sock.on(`tool-event:${run.id}`, (e: ToolEvent) => {
      if (!disposed) setEvents((prev) => [...prev, e]);
    });
    // 轮询 work-item 状态，跑到 review 时刷新
    const timer = setInterval(() => onStatusChange(), 1000);
    return () => {
      disposed = true;
      clearInterval(timer);
      sock.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.id]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [events]);

  if (!run) {
    if (wi.status === "ready") {
      return (
        <Button variant="contained" onClick={onDispatch}>
          🤖 派给 AI 开始
        </Button>
      );
    }
    return <Alert severity="info">点「标记就绪」后再「派给 AI」开始</Alert>;
  }

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="body2" color="text.secondary" fontFamily="monospace">
          ToolRun #{run.id.slice(-8)}
        </Typography>
        <Chip size="small" label={run.status} color={run.status === "succeeded" ? "success" : run.status === "failed" ? "error" : "warning"} />
        <Typography variant="body2" color="text.secondary">
          {run.providerId} provider
        </Typography>
      </Stack>
      <Paper
        ref={logRef}
        elevation={3}
        sx={{
          bgcolor: "#1e1e1e",
          color: "#4caf50",
          p: 2,
          height: 360,
          overflow: "auto",
          fontFamily: "monospace",
          fontSize: 13,
          whiteSpace: "pre-wrap",
        }}
      >
        {events.length === 0 ? (
          <span style={{ color: "#888" }}>等待 AI 产出…</span>
        ) : (
          events.map((e) => <LogLine key={`${e.runId}-${e.seq}`} e={e} />)
        )}
        {run.status === "running" && <span className="cursor">▌</span>}
      </Paper>
      <Typography variant="body2" color="text.secondary">
        事件序列：{events.map((e) => e.type).join(" → ") || "（无）"}
      </Typography>
    </Stack>
  );
}

function LogLine({ e }: { e: ToolEvent }) {
  const ts = new Date(e.ts).toLocaleTimeString("zh-CN");
  if (e.type === "started") return <div style={{ color: "#90caf9" }}>[{ts}] ▶ started</div>;
  if (e.type === "completed") return <div style={{ color: "#81c784" }}>[{ts}] ✔ completed (exitCode {e.exitCode})</div>;
  if (e.type === "failed") return <div style={{ color: "#ef5350" }}>[{ts}] ✖ failed: {e.error?.message}</div>;
  if (e.type === "output") return <div>[{ts}] {e.text}</div>;
  return <div>[{ts}] {e.type}</div>;
}

/** 审批 Tab */
function ApprovalPanel({
  handoff,
  latestRunId,
  wiStatus,
  onDecided,
  setToast,
}: {
  handoff: Handoff | null;
  latestRunId: string | null;
  wiStatus: WorkItem["status"];
  onDecided: () => Promise<void>;
  setToast: (s: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [diff, setDiff] = useState("");
  const [diffError, setDiffError] = useState("");
  const [diffLoading, setDiffLoading] = useState(false);
  const [prUrl, setPrUrl] = useState("");

  useEffect(() => {
    if (wiStatus !== "review" || !latestRunId) {
      setDiff("");
      setDiffError("");
      setDiffLoading(false);
      return;
    }

    let active = true;
    setDiffLoading(true);
    setDiffError("");
    api
      .getDiff(latestRunId)
      .then((nextDiff) => {
        if (active) setDiff(nextDiff);
      })
      .catch((err: unknown) => {
        if (active) setDiffError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (active) setDiffLoading(false);
      });

    return () => {
      active = false;
    };
  }, [latestRunId, wiStatus]);

  const decide = async (action: "approve" | "reject") => {
    if (!handoff) return;
    setLoading(true);
    try {
      if (action === "approve") {
        const result = await api.approve(handoff.id, reason);
        setPrUrl(result.prUrl ?? "");
      } else {
        await api.reject(handoff.id, reason);
      }
      setToast(action === "approve" ? "已批准 → done" : "已打回 → 重新处理");
      await onDecided();
    } finally {
      setLoading(false);
    }
  };

  const prCard = prUrl ? (
    <Box
      sx={{
        border: 1,
        borderColor: "divider",
        borderRadius: 1,
        p: 2,
        bgcolor: "background.paper",
      }}
    >
      <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
        <Typography variant="subtitle2">PR</Typography>
        <Button size="small" variant="outlined" href={prUrl} target="_blank" rel="noreferrer">
          打开
        </Button>
      </Stack>
      <Typography variant="body2" color="text.secondary" fontFamily="monospace" sx={{ mt: 1, wordBreak: "break-all" }}>
        {prUrl}
      </Typography>
    </Box>
  ) : null;

  if (!handoff) {
    return (
      <Stack spacing={2}>
        {prCard}
        <Alert severity="info">暂无待审批项{wiStatus === "done" ? "（已完成）" : ""}</Alert>
      </Stack>
    );
  }

  return (
    <Stack spacing={2}>
      {prCard}
      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Alert severity="info">等待审批</Alert>
            <Typography variant="body2" color="text.secondary">
              当前状态：<strong>{handoff.fromStatus}</strong> → <strong>{handoff.toStatus}</strong>
            </Typography>
            <Box>
              {diffLoading ? (
                <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
                  <CircularProgress size={20} />
                </Box>
              ) : diffError ? (
                <Alert severity="error">{diffError}</Alert>
              ) : (
                <DiffViewer diff={diff} />
              )}
            </Box>
            <TextField label="审批意见" value={reason} onChange={(e) => setReason(e.target.value)} multiline rows={2} fullWidth />
            <Stack direction="row" spacing={2} justifyContent="flex-end">
              <Button variant="outlined" color="error" onClick={() => decide("reject")} disabled={loading}>
                打回
              </Button>
              <Button variant="contained" color="primary" onClick={() => decide("approve")} disabled={loading}>
                {loading ? <CircularProgress size={20} /> : "批准"}
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}

/** 审计 Tab：AuditEvent 时间线（List 实现） */
function AuditPanel({ workItemId }: { workItemId: string }) {
  const [audits, setAudits] = useState<AuditEvent[] | null>(null);

  useEffect(() => {
    api.listAudits(workItemId).then(setAudits);
  }, [workItemId]);

  if (audits === null) return <CircularProgress />;
  if (audits.length === 0) return <Alert severity="info">暂无审计记录</Alert>;

  const icon = (t: string) => (t === "user" ? "👤" : t === "tool" ? "🤖" : "⚙️");

  return (
    <List>
      {audits.map((a) => {
        const human = a.action.startsWith("handoff");
        return (
          <ListItem
            key={a.id}
            sx={{
              borderLeft: 3,
              borderColor: human ? "secondary.main" : "divider",
              bgcolor: human ? "secondary.lighter" : "transparent",
              mb: 0.5,
            }}
          >
            <ListItemText
              primary={
                <Stack direction="row" spacing={1} alignItems="center">
                  <span>{icon(a.actorType)}</span>
                  <Typography component="span" fontFamily="monospace" fontSize={13}>
                    {a.action}
                  </Typography>
                </Stack>
              }
              secondary={`${new Date(a.createdAt).toLocaleString("zh-CN")} · by ${a.actorId}`}
            />
          </ListItem>
        );
      })}
    </List>
  );
}
