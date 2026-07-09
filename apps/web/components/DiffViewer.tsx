"use client";

import { useMemo, useState } from "react";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Chip,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import ReactDiffViewer from "react-diff-viewer-continued";
import { diffStat } from "@/lib/diffStat";

type ParsedFile = {
  file: string;
  patch: string;
  oldValue: string;
  newValue: string;
};

function splitFiles(diff: string): string[] {
  const normalized = diff.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];
  if (!/^diff --git /m.test(normalized)) return [normalized];
  return normalized
    .split(/^diff --git /m)
    .filter(Boolean)
    .map((part) => `diff --git ${part}`.trimEnd());
}

function fileNameFromPatch(lines: string[]): string {
  const diffHeader = lines.find((line) => line.startsWith("diff --git "));
  if (diffHeader) {
    const match = diffHeader.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (match) return match[2] === "/dev/null" ? match[1] : match[2];
  }

  const nextFile = lines.find((line) => line.startsWith("+++ "));
  const nextName = nextFile?.replace(/^\+\+\+ /, "").replace(/^b\//, "");
  if (nextName && nextName !== "/dev/null") return nextName;

  const prevFile = lines.find((line) => line.startsWith("--- "));
  const prevName = prevFile?.replace(/^--- /, "").replace(/^a\//, "");
  if (prevName && prevName !== "/dev/null") return prevName;

  return "patch";
}

function buildDiffValues(patch: string): { oldValue: string; newValue: string } {
  const oldLines: string[] = [];
  const newLines: string[] = [];
  let inHunk = false;

  for (const line of patch.split("\n")) {
    if (line.startsWith("@@")) {
      inHunk = true;
      continue;
    }
    if (!inHunk || line.startsWith("\\ No newline at end of file")) continue;

    const prefix = line[0];
    const content = line.slice(1);
    if (prefix === " ") {
      oldLines.push(content);
      newLines.push(content);
    } else if (prefix === "-") {
      oldLines.push(content);
    } else if (prefix === "+") {
      newLines.push(content);
    }
  }

  return {
    oldValue: oldLines.join("\n"),
    newValue: newLines.join("\n"),
  };
}

function parseFiles(diff: string): ParsedFile[] {
  return splitFiles(diff).map((patch) => {
    const lines = patch.split("\n");
    const file = fileNameFromPatch(lines);
    const { oldValue, newValue } = buildDiffValues(patch);
    return { file, patch, oldValue, newValue };
  });
}

export function DiffViewer({ diff }: { diff: string }) {
  const files = useMemo(() => parseFiles(diff), [diff]);
  const total = useMemo(() => diffStat(diff), [diff]);
  const [viewMode, setViewMode] = useState<"unified" | "split">("unified");

  if (!diff.trim()) {
    return (
      <Typography variant="body2" color="text.secondary">
        无 diff
      </Typography>
    );
  }

  return (
    <Stack spacing={1.5}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: "wrap", rowGap: 1 }}>
        <Chip size="small" label={`${files.length} 文件`} />
        <Chip size="small" color="success" label={`+${total.added}`} />
        <Chip size="small" color="error" label={`-${total.removed}`} />
        <ToggleButtonGroup
          size="small"
          exclusive
          value={viewMode}
          onChange={(_, nextMode: "unified" | "split" | null) => {
            if (nextMode) setViewMode(nextMode);
          }}
        >
          <ToggleButton value="unified">统一</ToggleButton>
          <ToggleButton value="split">分栏</ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      {files.map((file, index) => {
        const stat = diffStat(file.patch);
        const showRawPatch = !file.oldValue && !file.newValue;

        return (
          <Accordion key={`${file.file}-${index}`} defaultExpanded={files.length === 1 || index === 0} disableGutters>
            <AccordionSummary expandIcon={<ExpandMoreIcon fontSize="small" />}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
                <Typography variant="body2" fontFamily="monospace" sx={{ minWidth: 0 }} noWrap>
                  {file.file}
                </Typography>
                <Chip size="small" color="success" label={`+${stat.added}`} />
                <Chip size="small" color="error" label={`-${stat.removed}`} />
              </Stack>
            </AccordionSummary>
            <AccordionDetails sx={{ px: 0, py: 0.5 }}>
              {showRawPatch ? (
                <Box
                  component="pre"
                  sx={{
                    m: 0,
                    px: 2,
                    py: 1.5,
                    overflow: "auto",
                    bgcolor: "grey.50",
                    fontFamily: "monospace",
                    fontSize: 12,
                  }}
                >
                  {file.patch}
                </Box>
              ) : (
                <Box sx={{ maxHeight: 480, overflow: "auto", borderTop: 1, borderColor: "divider" }}>
                  <ReactDiffViewer
                    oldValue={file.oldValue}
                    newValue={file.newValue}
                    splitView={viewMode === "split"}
                    hideLineNumbers={false}
                    showDiffOnly={false}
                    useDarkTheme={false}
                  />
                </Box>
              )}
            </AccordionDetails>
          </Accordion>
        );
      })}
    </Stack>
  );
}
