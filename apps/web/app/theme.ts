import { createTheme, type ThemeOptions } from "@mui/material/styles";

/** Conductor 主题：primary 紫色（呼应 review 待审批的 whoa 色） */
export const theme = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#6750A4" },
    secondary: { main: "#7E57C2" },
  },
  shape: { borderRadius: 10 },
} as ThemeOptions);

/** WorkItemStatus → 中文文案（颜色由 StatusChip 处理） */
export const workItemStatusLabel: Record<string, string> = {
  draft: "草稿",
  ready: "就绪",
  running: "运行中",
  review: "待审批",
  done: "完成",
  failed: "失败",
};

/** WorkItemStatus → MUI Chip color（review 特殊紫） */
export const workItemStatusColor: Record<string, "default" | "info" | "warning" | "success" | "error" | "secondary"> = {
  draft: "default",
  ready: "info",
  running: "warning",
  review: "secondary",
  done: "success",
  failed: "error",
};

/** WorkItemType → 中文 */
export const workItemTypeLabel: Record<string, string> = {
  bug: "Bug",
  feature: "Feature",
  task: "Task",
};
