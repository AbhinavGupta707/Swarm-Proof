# SwarmProof Codex Runbook

Use `swarmproof_codex_execution_brief.md` for the complete source of truth. This file is the short operator version.

## Gold Command 1: Bootstrap/Foundation

Use this first in the local checkout.

```text
/goal Bring SwarmProof from scaffold to Foundation Ready.

Read AGENTS.md, swarmproof_codex_execution_brief.md, swarmproof_build_ready_spec.md, docs/architecture.md, and docs/codex-runbook.md. Complete State 0 and State 1 from the execution brief. Ensure the monorepo is initialized, dependencies install, the Next app runs, shared packages compile, placeholder routes exist, Prisma schema is present, and pnpm lint/typecheck/build are available. Commit a clean baseline when done. Diagnose missing features in layer order: registration/discovery/install/activation first, then permissions/runtime.
```

## Gold Command 2: Parallel Worktrees

After the foundation baseline commit exists, start separate Codex worktree sessions using the prompts in section 8 of `swarmproof_codex_execution_brief.md`.

Recommended sessions:

- Demo Target Goal
- Backend/API Goal
- Worker Goal
- Live UI Goal
- Report/Testgen Goal
- Analytics/Polish Goal

If you only want two sessions, use:

1. Product UI session: demo target, live UI, report/testgen, analytics/polish.
2. Execution session: backend/API, worker, DB, provider integration.

## Gold Command 3: Integration

Run this in a fresh local or worktree session after the parallel sessions finish.

```text
/goal Integrate completed SwarmProof workstreams into a verified hackathon-ready product.

Read AGENTS.md, swarmproof_codex_execution_brief.md, swarmproof_build_ready_spec.md, docs/architecture.md, and docs/codex-runbook.md. Inspect all branch/worktree diffs before merging. Merge in order: foundation, demo target, backend/API, worker, live UI, report/testgen, analytics/polish. Resolve conflicts by preserving the public demo path and spec compliance. After each merge, run targeted checks. After all merges, run pnpm lint, pnpm typecheck, pnpm test if present, and pnpm build. Then smoke test landing -> demo audit -> running -> report -> generated test -> share -> novus proof.
```

## Gold Command 4: Release

```text
/goal Prepare SwarmProof for final Devpost submission.

Read AGENTS.md, swarmproof_codex_execution_brief.md, swarmproof_build_ready_spec.md, docs/architecture.md, and docs/codex-runbook.md. Verify deployment, environment variables, Novus install, and demo audit. Produce deployment notes, demo video script, Devpost written description, known limitations, and judging-rubric talking points. Run final checks. Complete only when the public URL can be used by a stranger without local setup.
```
