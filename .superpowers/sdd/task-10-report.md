status: done
commits: feat(web): project list page (git url) + project-scoped work items
test summary: `pnpm --filter @conductor/web lint` and `pnpm --filter @conductor/api lint` passed
concerns: no browser smoke was run in this task; project detail currently resolves project metadata via `listProjects()` until a dedicated project read API exists
