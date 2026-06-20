# SwarmProof Architecture

## Product Loop

1. User submits a URL and goal.
2. Web app creates an audit and agent runs.
3. Browser execution service runs personas.
4. Worker sends step and completion callbacks.
5. Web app stores events, screenshots, issues, and reports.
6. User views live progress, replay evidence, generated tests, and shareable report.

## Apps

### `apps/web`

Next.js App Router app. Owns:

- public landing and demo target;
- audit creation and running views;
- report, replay, tests, share, privacy, and Novus proof pages;
- API routes for audits, events, worker callbacks, reports, and sharing.

### `apps/browser-worker`

Node service for browser execution. Owns:

- provider abstraction: `demo`, `local-playwright`, later `browserbase`;
- persona runner loop;
- screenshots, console/network capture, and callback delivery.

## Packages

- `packages/types`: shared contracts used by web and worker.
- `packages/events`: event names and safe event wrapper.
- `packages/ai`: Fireworks provider wrapper and prompts.
- `packages/db`: DB client boundary, Postgres/Supabase REST audit snapshot adapters, memory fallback, and Prisma-ready normalized schema.
- `packages/testgen`: generated Playwright test helpers.

## Current Runtime State

The app keeps deterministic demo data and memory fallback so the judged `/demo-target` path remains reliable without external services. The browser worker now has a `local-playwright` provider that can drive `/demo-target` and perform conservative public URL observation when `BROWSER_WORKER_URL` and `BROWSER_PROVIDER=local-playwright` are configured.

When `DATABASE_URL` is configured, audit state is backed by Postgres table `swarmproof_audit_snapshots`. The adapter stores each audit as a JSONB snapshot, including runs, steps, events, issues, artifacts, reports, jobs, and share tokens. Mutating routes and worker callbacks use async DB functions. Direct Postgres mode uses per-audit advisory locks and is the production default. Supabase REST remains available only when `SWARMPROOF_PERSISTENCE=supabase-rest` is explicitly set; do not let Supabase service credentials alone select it for live audit writes. Durable object storage is still a future improvement; screenshots currently remain report-safe artifact references/data URLs.

## Integration Rule

Diagnose in layer order:

1. registration and route/file discovery;
2. package install and activation;
3. configuration and environment variables;
4. permissions and sandbox;
5. runtime bugs.
