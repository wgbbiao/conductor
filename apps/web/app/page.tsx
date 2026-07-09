"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Skeleton,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { TopAppBar } from "@/components/AppBar";
import { api } from "@/lib/api";
import { getToken } from "@/lib/auth";
import type { Project } from "@/lib/types";

export default function HomePage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    api.listProjects().then(setProjects).catch((e) => setError(String(e)));
  }, [router]);

  const reload = async () => setProjects(await api.listProjects());

  if (error) {
    return (
      <>
        <TopAppBar />
        <Box p={3}>
          <Alert severity="error">{error}</Alert>
        </Box>
      </>
    );
  }

  return (
    <>
      <TopAppBar title="项目" />
      <Box sx={{ maxWidth: 960, mx: "auto", p: 3 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
          <Typography variant="h5">项目</Typography>
          <Button variant="contained" onClick={() => setOpen(true)}>
            新建项目
          </Button>
        </Stack>

        {projects === null ? (
          <Stack spacing={1}>
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} variant="rounded" height={88} />
            ))}
          </Stack>
        ) : projects.length === 0 ? (
          <Box sx={{ py: 8, textAlign: "center", color: "text.secondary" }}>
            <Typography>暂无项目</Typography>
          </Box>
        ) : (
          <Stack spacing={1.5}>
            {projects.map((project) => (
              <Box
                key={project.id}
                sx={{
                  border: "1px solid",
                  borderColor: "divider",
                  borderRadius: 2,
                  px: 2,
                  py: 1.75,
                }}
              >
                <Stack direction="row" spacing={2} alignItems="center">
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="subtitle1">{project.name}</Typography>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ fontFamily: "monospace", wordBreak: "break-all" }}
                    >
                      {project.repoUrl}
                    </Typography>
                  </Box>
                  <Stack spacing={1} alignItems="flex-end" sx={{ flexShrink: 0 }}>
                    <Typography variant="caption" color="text.secondary">
                      {project.defaultBranch}
                    </Typography>
                    <Button variant="outlined" onClick={() => router.push(`/projects/${project.id}`)}>
                      进入
                    </Button>
                  </Stack>
                </Stack>
              </Box>
            ))}
          </Stack>
        )}
      </Box>

      <CreateProjectDialog
        open={open}
        onClose={() => setOpen(false)}
        onCreated={async () => {
          setOpen(false);
          await reload();
          setToast("已创建项目");
        }}
      />

      <Snackbar open={!!toast} autoHideDuration={2000} onClose={() => setToast("")}>
        <Alert severity="success">{toast}</Alert>
      </Snackbar>
    </>
  );
}

function CreateProjectDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void | Promise<void>;
}) {
  const [name, setName] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api.createProject(name.trim(), repoUrl.trim());
      setName("");
      setRepoUrl("");
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
        <DialogTitle>新建项目</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="项目名称" value={name} onChange={(e) => setName(e.target.value)} required fullWidth />
            <TextField label="Git URL" value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} required fullWidth />
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>取消</Button>
          <Button type="submit" variant="contained" disabled={loading || !name.trim() || !repoUrl.trim()}>
            {loading ? <CircularProgress size={20} /> : "创建"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
