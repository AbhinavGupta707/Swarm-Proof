# SwarmProof

AI users test your product before real users suffer.

SwarmProof is being built for Mind the Product World Product Day 2026. The MVP is a public web app where a user enters a product URL and goal, watches AI browser personas attempt the goal, and receives evidence-backed UX friction, replay screenshots, and generated Playwright tests.

## Source Of Truth

- `swarmproof_build_ready_spec.md`: product and implementation specification.
- `swarmproof_codex_execution_brief.md`: Codex orchestration plan, state gates, and goal prompts.
- `AGENTS.md`: durable repo instructions for Codex sessions.

## Architecture

```txt
apps/
  web/                Next.js App Router product UI and APIs
  browser-worker/     Playwright/agent worker service
packages/
  types/              Shared audit, browser, and persona contracts
  events/             Event names and tracking wrapper
  ai/                 Fireworks provider wrapper and prompts
  db/                 Prisma schema and DB client boundary
  testgen/            Playwright test generation helpers
docs/
  architecture.md     Implementation architecture
  codex-runbook.md    Gold commands and workstream prompts
```

## Local Setup

```bash
pnpm install
pnpm dev
```

For the local Playwright worker slice, see `docs/live-worker.md`.

Useful checks:

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

## Hackathon Demo Path

The reliable demo path is the highest priority:

1. Open `/`.
2. Click or navigate to `/audits/new`.
3. Start a demo audit against `/demo-target`.
4. Watch `/audits/demo/running`.
5. Open `/audits/demo/report`, `/audits/demo/tests`, and `/share/demo-share`.
6. Confirm event proof at `/novus-proof`.
