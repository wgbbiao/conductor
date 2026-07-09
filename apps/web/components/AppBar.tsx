"use client";

import { AppBar as MuiAppBar, Toolbar, Typography, Box, Button } from "@mui/material";
import { useRouter } from "next/navigation";
import { clearToken } from "@/lib/auth";

/** 顶栏：Logo + 标题 + 登出 */
export function TopAppBar({ title, back }: { title?: string; back?: boolean }) {
  const router = useRouter();
  const logout = () => {
    clearToken();
    router.push("/login");
  };
  return (
    <MuiAppBar position="sticky" elevation={1}>
      <Toolbar>
        {back && (
          <Button color="inherit" onClick={() => router.push("/")} sx={{ mr: 1 }}>
            ← 返回
          </Button>
        )}
        <Typography variant="h6" component="div" sx={{ mr: 2 }}>
          🎼 Conductor
        </Typography>
        {title && (
          <Typography variant="subtitle1" sx={{ flexGrow: 1 }}>
            {title}
          </Typography>
        )}
        <Box sx={{ flexGrow: !title ? 1 : 0 }} />
        <Button color="inherit" onClick={logout}>
          登出
        </Button>
      </Toolbar>
    </MuiAppBar>
  );
}
