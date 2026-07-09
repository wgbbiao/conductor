"use client";

import { Chip } from "@mui/material";
import { workItemStatusColor, workItemStatusLabel, workItemTypeLabel } from "@/app/theme";
import type { WorkItemStatus, WorkItemType } from "@/lib/types";

export function WorkItemStatusChip({ status }: { status: WorkItemStatus }) {
  return (
    <Chip
      size="small"
      color={workItemStatusColor[status] ?? "default"}
      label={workItemStatusLabel[status] ?? status}
    />
  );
}

export function WorkItemTypeChip({ type }: { type: WorkItemType }) {
  const color = type === "bug" ? "error" : type === "feature" ? "info" : "default";
  return <Chip size="small" variant="outlined" color={color as "error" | "info" | "default"} label={workItemTypeLabel[type] ?? type} />;
}
