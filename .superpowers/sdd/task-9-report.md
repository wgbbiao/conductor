status: done
commits: feat(handoff): approve pushes branch + creates PR
test summary: `pnpm --filter @conductor/api lint`, `pnpm --filter @conductor/api build`, and `pnpm --filter @conductor/api test` all passed (7 files, 32 tests)
concerns: no scoped approve-path regression test exists; the current e2e smoke would need fake `git`/`gh` wiring outside the assigned scope
