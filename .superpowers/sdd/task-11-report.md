status: done
commits: feat(web): rich diff viewer (file-grouped) in approval tab + PR link
test summary: `pnpm install --force` and `pnpm --filter @conductor/web lint` passed
concerns: diff rendering is intentionally kept at unified-diff file grouping plus basic line stats; binary or non-hunk patches fall back to raw patch text
