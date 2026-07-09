"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Skeleton,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { TopAppBar } from "@/components/AppBar";
import { WorkItemStatusChip, WorkItemTypeChip } from "@/components/StatusChip";
import { api } from "@/lib/api";
import { getToken } from "@/lib/auth";
import type { Project, WorkItem, WorkItemType } from "@/lib/types";

export default function ProjectPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const [project, setProject] = useState<Project | null>(null);
  const [items, setItems] = useState<WorkItem[] | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    (async () => {
      try {
        const [projects, workItems] = await Promise.all([api.listProjects(), api.listWorkItemsByProject(id)]);
        const nextProject = projects.find((candidate) => candidate.id === id);
        if (!nextProject) throw new Error("项目不存在");
        setProject(nextProject);
        setItems(workItems);
      } catch (e) {
        setError(String(e));
      }
    })();
  }, [id, router]);

  const reload = async () => setItems(await api.listWorkItemsByProject(id));

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

  return (
    <>
      <TopAppBar title={project?.name ?? "项目"} back />
      <Box sx={{ maxWidth: 960, mx: "auto", p: 3 }}>
        {project && (
          <Stack spacing={0.5} sx={{ mb: 2 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="h5">工作项</Typography>
              <Button variant="contained" onClick={() => setOpen(true)}>
                新建工作项
              </Button>
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ fontFamily: "monospace", wordBreak: "break-all" }}>
              {project.repoUrl}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              默认分支：{project.defaultBranch}
            </Typography>
          </Stack>
        )}

        {items === null ? (
          <Stack spacing={1}>
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} variant="rounded" height={64} />
            ))}
          </Stack>
        ) : items.length === 0 ? (
          <Box sx={{ py: 8, textAlign: "center", color: "text.secondary" }}>
            <Typography>暂无工作项</Typography>
          </Box>
        ) : (
          <List>
            {items.map((wi) => (
              <ListItemButton
                key={wi.id}
                onClick={() => router.push(`/work-items/${wi.id}`)}
                sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, mb: 1 }}
              >
                <Stack direction="row" spacing={1.5} alignItems="center" sx={{ width: "100%" }}>
                  <WorkItemTypeChip type={wi.type} />
                  <ListItemText
                    primary={wi.title}
                    secondary={new Date(wi.updatedAt).toLocaleString("zh-CN")}
                    sx={{ flex: 1 }}
                  />
                  <WorkItemStatusChip status={wi.status} />
                </Stack>
              </ListItemButton>
            ))}
          </List>
        )}
      </Box>

      {project && (
        <CreateDialog
          open={open}
          projectId={project.id}
          onClose={() => setOpen(false)}
          onCreated={async () => {
            setOpen(false);
            await reload();
            setToast("已创建工作项");
          }}
        />
      )}

      <Snackbar open={!!toast} autoHideDuration={2000} onClose={() => setToast("")}>
        <Alert severity="success">{toast}</Alert>
      </Snackbar>
    </>
  );
}

function CreateDialog({
  open,
  projectId,
  onClose,
  onCreated,
}: {
  open: boolean;
  projectId: string;
  onClose: () => void;
  onCreated: () => void | Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<WorkItemType>("bug");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api.createWorkItem(projectId, { title, type, description });
      setTitle("");
      setDescription("");
      setType("bug");
      await onCreated();
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <form onSubmit={submit}>
        <DialogTitle>新建工作项</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="标题" value={title} onChange={(e) => setTitle(e.target.value)} required fullWidth />
            <TextField select label="类型" value={type} onChange={(e) => setType(e.target.value as WorkItemType)} fullWidth>
              <MenuItem value="bug">Bug</MenuItem>
              <MenuItem value="feature">Feature</MenuItem>
              <MenuItem value="task">Task</MenuItem>
            </TextField>
            <TextField
              label="描述"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              multiline
              rows={3}
              fullWidth
            />
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>取消</Button>
          <Button type="submit" variant="contained" disabled={loading || !title.trim()}>
            {loading ? <CircularProgress size={20} /> : "创建"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
