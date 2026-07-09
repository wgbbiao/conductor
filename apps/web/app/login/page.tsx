"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Box,
  Button,
  Card,
  CardContent,
  Alert,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { api } from "@/lib/api";
import { setToken, getToken } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@conductor.dev");
  const [password, setPassword] = useState("secret123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // 已登录直接进首页
  if (typeof window !== "undefined" && getToken()) {
    void router.replace("/");
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { token } = await api.login(email, password);
      setToken(token);
      router.replace("/");
    } catch {
      setError("凭据无效");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", bgcolor: "background.default" }}>
      <Card sx={{ width: 380 }}>
        <CardContent>
          <Stack spacing={2} component="form" onSubmit={submit}>
            <Typography variant="h5" align="center">
              🎼 Conductor
            </Typography>
            <Typography variant="body2" color="text.secondary" align="center">
              登录以开始编排
            </Typography>
            <TextField label="邮箱" value={email} onChange={(e) => setEmail(e.target.value)} fullWidth required />
            <TextField
              label="密码"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              fullWidth
              required
            />
            {error && <Alert severity="error">{error}</Alert>}
            <Button type="submit" variant="contained" fullWidth disabled={loading}>
              {loading ? "登录中…" : "登录"}
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
