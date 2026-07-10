status: done
commits: feat(web): rich diff viewer (file-grouped) in approval tab + PR link
test summary: `pnpm install --force` and `pnpm --filter @conductor/web lint` passed
concerns: diff rendering is intentionally kept at unified-diff file grouping plus basic line stats; binary or non-hunk patches fall back to raw patch text

review fix:
- `api.getDiff()` no longer swallows HTTP errors.
- Approval panel now renders a diff load error as an error alert instead of showing it as empty diff.
- `pnpm --filter @conductor/web lint`: PASS
