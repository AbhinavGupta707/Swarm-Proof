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
- `packages/db`: Prisma schema plus DB client boundary.
- `packages/testgen`: generated Playwright test helpers.

## Current Scaffold State

This scaffold intentionally starts with deterministic demo data so the product can be built and judged even before browser provider credentials exist. Replace demo data with DB-backed APIs and worker callbacks as workstreams land.

## Integration Rule

Diagnose in layer order:

1. registration and route/file discovery;
2. package install and activation;
3. configuration and environment variables;
4. permissions and sandbox;
5. runtime bugs.
