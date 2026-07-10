status: done
commits: feat(tools): codex tool provider (spawn codex exec, streaming) + workspace module
test summary: red test first: `pnpm --filter @conductor/api test` failed on missing `./codex-tool-provider`; final `pnpm --filter @conductor/api test` passed (7 files, 30 tests)
concerns: none

review fix:
- Added a pre-aborted `AbortSignal` guard so Codex is not spawned after cancellation.
- Added regression test `signal 已取消时不启动 codex`.
- `pnpm --filter @conductor/api test -- --run src/tools/codex-tool-provider.spec.ts`: PASS (6 tests)
- `pnpm --filter @conductor/api test`: PASS (7 files, 31 tests)
- Fixed TypeScript union typing in the event helper.
- `pnpm --filter @conductor/api lint`: PASS
- `pnpm --filter @conductor/api build`: PASS
