export type DiffStat = {
  added: number;
  removed: number;
};

export function diffStat(diff: string): DiffStat {
  let added = 0;
  let removed = 0;

  for (const line of diff.replace(/\r\n/g, "\n").split("\n")) {
    if (line.startsWith("+++ ") || line.startsWith("--- ")) continue;
    if (line.startsWith("+")) added += 1;
    else if (line.startsWith("-")) removed += 1;
  }

  return { added, removed };
}
