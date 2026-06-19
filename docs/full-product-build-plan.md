# SwarmProof Full Product Build Plan

Date: June 19, 2026  
Purpose: Build SwarmProof from a deterministic local demo into a real agentic product that can accept a public URL, run browser personas against it, collect evidence, and generate useful product/QA outputs.

Related docs:

- `swarmproof_build_ready_spec.md`
- `swarmproof_codex_execution_brief.md`
- `docs/architecture.md`
- `docs/spec-gap-analysis.md`

External implementation references:

- Browserbase docs: https://docs.browserbase.com/
- Stagehand docs: https://docs.stagehand.dev/
- Fireworks docs: https://docs.fireworks.ai/getting-started/introduction

## 1. Executive Recommendation

Do not do release proof first if the product goal is "fully working agentic URL audits." Release proof should wait until the execution spine is real enough.

The correct build order is:

1. Add a thin test harness around the current product contracts.
2. Add persistence for audits, runs, steps, artifacts, reports, events, and share tokens.
3. Build the real worker dispatch path from the web app to the browser worker.
4. Add minimal durable artifact storage, or build it in parallel with the worker.
5. Implement real Playwright execution on the built-in demo target first.
6. Expand the agent loop to public external URLs with safety gates, timeouts, and fallback reports.
7. Use Fireworks for structured action planning and report synthesis.
8. Make the running UI poll live worker progress.
9. Only then do public deployment, Novus proof, demo video, and Devpost release assets.

The reason persistence comes before the real worker is simple: the web app, browser worker, running page, report page, and share page all need the same durable state. An in-memory store will fail as soon as the worker calls back to a different process, the server restarts, or Vercel runs multiple instances.

The reason tests should not wait until after persistence is also simple: persistence will rewrite the most important product boundary. Add small contract tests first or in the same milestone so the current deterministic path does not break while the DB adapter lands.

Artifact storage can be phased. The first real `/demo-target` Playwright run can use temporary local artifacts or DB-stored data URLs for speed, but public external URL reports should not be considered complete until screenshots and traces are stored durably.

## 2. What "Fully Working Product" Means

For this phase, fully working means:

- A user can submit a public URL and a goal.
- SwarmProof runs preflight and blocks unsafe targets.
- SwarmProof launches at least normal, mobile, and chaos personas.
- Each persona controls a real browser session.
- The worker collects screenshots, page state, step logs, console errors, and network failures where possible.
- The agent uses a structured action loop, not a hard-coded script.
- The live dashboard updates while the run is happening.
- The report is generated from collected evidence.
- The report includes product recommendations, reproducible steps, screenshots, severity, suggested fixes, and a generated Playwright test.
- The share link works after reloads and server restarts.
- The system has deterministic fallback for the built-in demo when external execution is unavailable.

This does not yet mean:

- Authenticated private-app testing.
- CAPTCHA or 2FA bypass.
- Security scanning.
- Accessibility certification.
- Automatic PR creation against arbitrary codebases.
- Guaranteed success on every third-party website.

## 3. Critical Product Boundaries

### Public URL Auditing

External URL auditing must be honest. The product should support public unauthenticated flows first. If the page requires login, CAPTCHA, payment, email verification, or human approval, SwarmProof should generate an auth-limited report instead of pretending the run succeeded.

### Safe Browser Actions

Chaos behavior is useful, but risky on real production websites. Default external URL mode should avoid dangerous or irreversible actions unless the user explicitly confirms that they own the target and permits form submissions.

Recommended controls:

- Require a permission checkbox before running an external target.
- Default to same-origin navigation.
- Block private/internal hosts before preflight and after redirects.
- Block metadata IPs, localhost, private ranges, `.local`, `.internal`, and bare intranet hostnames.
- Add DNS resolution checks before worker navigation.
- Intercept navigation/resource requests in the worker and abort unsafe local/private destinations.
- Limit max steps, max run time, max screenshots, and concurrent runs per anonymous user.
- Do not accept credentials in the MVP.

### Recommendations Versus PR Changes

The current spec supports recommendations, bug reports, and generated Playwright tests. It does not support real PR creation.

To generate actual PR changes, SwarmProof would need a connected repository, GitHub OAuth or a GitHub App, repo checkout, framework detection, code search, patch generation, tests, and user approval. That is a separate product layer. For this build, produce "PR-ready recommendations" and "copyable bug/test artifacts." Actual pull requests should be a later integration milestone.

## 4. Target Runtime Architecture

```txt
User
  -> Next.js web app
  -> POST /api/audits
  -> Postgres: Audit created
  -> POST /api/audits/:id/preflight
  -> Worker preflight or web preflight
  -> POST /api/audits/:id/run
  -> Job dispatch
  -> Browser worker
  -> Real Playwright or Stagehand/Browserbase provider
  -> Worker callbacks
  -> Postgres + artifact storage
  -> Live polling UI
  -> Evidence-based report generation
  -> Shareable report
```

Required runtime pieces:

- Postgres database: audit state, run state, steps, issues, reports, events, share tokens, job records.
- Artifact storage: screenshots, optional traces, console/network logs, maybe HAR files.
- Browser worker: long-running Node service with Playwright or Browserbase/Stagehand provider.
- AI provider wrapper: Fireworks structured JSON for actions and reports.
- Queue/dispatch: simple DB jobs first, then Inngest/Trigger.dev if needed.
- Web polling: `/api/audits/:id/events` every 2 seconds until terminal state.
- Safety layer: URL normalization, SSRF checks, redirect checks, network interception, rate limiting.

## 5. Provider Strategy

### Recommended Path

Implement a provider interface now, then choose the active provider by env:

```txt
BROWSER_PROVIDER=demo | local-playwright | browserbase-stagehand
```

Recommended sequence:

1. `demo`: keep deterministic fallback for reliability.
2. `local-playwright`: implement real browser runs against `/demo-target` and public URLs from a worker process.
3. `browserbase-stagehand`: add cloud browser infrastructure if credentials are available.

Why this shape:

- Local/self-hosted Playwright gives maximum control and works without additional browser provider credentials.
- Browserbase is purpose-built for cloud browser agents and supports Playwright-style browser control.
- Stagehand adds agent-friendly primitives such as observe, act, extract, and agent execution, which can reduce brittle selector code.
- Fireworks should stay behind the existing AI wrapper so the rest of the product does not care which model is active.

## 6. Detailed Milestones

### Milestone 0: Contract Tests And Baseline Guardrails

Goal: Protect the current demo path before rewriting storage and execution.

Build:

- Add a real test runner, preferably Vitest for package-level tests.
- Add a Playwright e2e config for the web demo path if dependency/install time permits.
- Keep tests small and contract-focused.

Files likely involved:

- `package.json`
- `apps/web/package.json`
- `packages/db/package.json`
- `packages/testgen/package.json`
- `packages/db/src/index.ts`
- `packages/testgen/src/playwright-template.ts`
- New test files under `packages/**/src/*.test.ts`
- Optional `apps/web/e2e/demo-audit.spec.ts`
- Optional `apps/web/playwright.config.ts`

Required tests:

- URL safety blocks `localhost`, `127.0.0.1`, private IPv4 ranges, IPv6 localhost, metadata IPs, `.local`, `.internal`.
- URL safety allows relative `/demo-target`.
- Default persona selection returns normal, mobile, chaos.
- Generated Playwright test contains `page.goto`, user actions, and an assertion.
- API contract returns `{ ok, data?, error? }` consistently.

Finish line:

- `pnpm test` runs real tests.
- `pnpm lint`, `pnpm typecheck`, and `pnpm build` still pass.

Verification:

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

### Milestone 1: Persistent Data Layer

Goal: Replace volatile in-memory state with durable audit state while keeping the current UI/API behavior intact.

Build:

- Add Prisma client setup.
- Keep the existing public function surface in `packages/db/src/index.ts` or wrap it with a stable repository interface.
- Implement a DB-backed adapter for:
  - `createAudit`
  - `runPreflight`
  - `startAuditRun`
  - `getAudit`
  - `getAuditOverview`
  - `getAuditEvents`
  - `generateAuditReport`
  - `createShare`
  - `getSharedReport`
  - `appendEvent`
  - `recordWorkerStep`
  - `completeWorkerRun`
- Add an explicit memory/demo adapter only for local fallback or tests.
- Add an `AuditJob` table or equivalent job state. This can be a simple DB polling queue before introducing Inngest/Trigger.dev.
- Add migrations and seed/demo helpers.

Schema additions to consider:

```txt
Audit.normalizedUrl
Audit.maxSteps
Audit.provider
Audit.preflightJson
Audit.errorCode
Audit.errorMessage
Audit.completedAt
AgentRun.mode
BrowserStep.status
BrowserStep.screenshotArtifactId
Artifact.auditId
Artifact.kind
Artifact.storageKey
Artifact.contentType
Artifact.sizeBytes
AuditJob.auditId
AuditJob.runId
AuditJob.status
AuditJob.attempts
AuditJob.lockedAt
AuditJob.lastError
```

Files likely involved:

- `packages/db/prisma/schema.prisma`
- `packages/db/src/index.ts`
- New `packages/db/src/client.ts`
- New `packages/db/src/adapters/memory.ts`
- New `packages/db/src/adapters/prisma.ts`
- All web API routes under `apps/web/app/api/**`

Finish line:

- A created audit survives a server restart.
- A share token survives a server restart.
- The deterministic demo still works through the same UI.
- Worker callback routes write durable steps and issues.

Verification:

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

Manual verification:

```txt
Create demo audit
Open report
Create share link
Restart dev server
Open share link again
Confirm steps, issues, report, and generated test are still present
```

### Milestone 2: Job Dispatch And Live Polling

Goal: Stop running the audit synchronously inside the API route and make the product behave like an async agent system.

Build:

- Change `POST /api/audits/:id/run` to create/dispatch run jobs.
- If `BROWSER_WORKER_URL` is configured, call the worker for each run.
- If no worker is configured and the target is `/demo-target`, use deterministic fallback.
- If no worker is configured and the target is external, return a clear `worker_unconfigured` report state.
- Add client-side polling to the running page.
- Add stop/cancel support at the DB state level.

Files likely involved:

- `apps/web/app/api/audits/[auditId]/run/route.ts`
- `apps/web/app/audits/[auditId]/running/page.tsx`
- New client component for polling, for example `apps/web/app/audits/[auditId]/running/running-dashboard.tsx`
- `packages/db/src/index.ts`
- `packages/types/src/audit.ts`
- `packages/types/src/browser.ts`

Finish line:

- Running page updates without refreshing.
- Runs move through `PENDING`, `RUNNING`, and terminal statuses.
- Worker callbacks appear in the UI as they arrive.
- Deterministic fallback still works if the worker is absent.

Verification:

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

Manual verification:

```txt
Start demo audit
Watch persona cards update while polling
Stop/cancel a run
Confirm terminal state is reflected in report
```

### Milestone 3: Real Playwright Worker On Demo Target

Goal: Replace scripted demo evidence with real browser evidence for the built-in target.

Build:

- Add Playwright to `apps/browser-worker`.
- Add browser lifecycle:
  - launch browser
  - create isolated context per persona
  - set viewport/device mode
  - attach console and network listeners
  - close context reliably
- Implement worker request validation.
- Implement callbacks:
  - step started or completed
  - screenshot artifact
  - console/network issue
  - run complete
- Implement demo-target runner with real navigation and selectors.
- Capture real screenshots after each meaningful step.
- Preserve deterministic fallback if browser launch fails.

Files likely involved:

- `apps/browser-worker/package.json`
- `apps/browser-worker/src/index.ts`
- New `apps/browser-worker/src/providers/local-playwright.ts`
- New `apps/browser-worker/src/runners/demo-target-runner.ts`
- New `apps/browser-worker/src/evidence/screenshots.ts`
- `packages/types/src/browser.ts`
- `apps/web/app/api/worker-callback/step/route.ts`
- `apps/web/app/api/worker-callback/complete/route.ts`

Finish line:

- Worker can run `/demo-target` with a real browser.
- Evidence screenshots are real page screenshots, not SVG placeholders.
- Mobile persona captures the mobile hidden CTA bug from the rendered page.
- Chaos persona can trigger duplicate-submit behavior on the rendered page.

Verification:

```bash
pnpm --filter @swarmproof/browser-worker build
pnpm --filter @swarmproof/browser-worker typecheck
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

Manual verification:

```txt
Start web app
Start browser worker
Set BROWSER_WORKER_URL
Create demo audit
Confirm screenshots come from Playwright
Confirm report uses worker evidence
```

### Milestone 4: Agentic External URL Runner

Goal: Let SwarmProof run a real browser agent against public unauthenticated sites.

Prerequisite: complete Milestone 5 or provide an explicitly temporary artifact store. External URL reports are only trustworthy when their screenshots and logs survive restarts.

Build:

- Implement a generic page observation pipeline:
  - current URL
  - title
  - visible text snippet
  - buttons, links, inputs, labels, placeholders, ARIA names
  - forms and submit controls
  - screenshot artifact
  - recent console/network errors
- Implement strict action schema validation.
- Use Fireworks through `packages/ai` to choose the next action.
- Add deterministic heuristic fallback when AI fails.
- Add action executor:
  - `click_text`
  - `fill_label`
  - `select_label`
  - `press`
  - `goto`
  - `wait`
  - `back`
  - `screenshot`
  - `done`
  - `fail`
- Add stuck detection:
  - repeated actions with no URL/DOM/text change
  - same error state repeated
  - max steps exceeded
  - login/CAPTCHA/payment/auth wall detected
- Add issue detection:
  - blocked goal
  - hidden/unclickable CTA
  - confusing labels
  - console errors
  - network failures
  - validation failures
  - duplicate submit when chaos mode is allowed
- Restrict navigation by default to same origin.

Files likely involved:

- `apps/browser-worker/src/runners/agent-runner.ts`
- `apps/browser-worker/src/agents/observe.ts`
- `apps/browser-worker/src/agents/execute-action.ts`
- `apps/browser-worker/src/agents/detect-issues.ts`
- `apps/browser-worker/src/evidence/network.ts`
- `apps/browser-worker/src/evidence/console.ts`
- `packages/ai/src/provider.ts`
- `packages/ai/src/prompts.ts`
- New `packages/ai/src/schemas.ts`
- `packages/types/src/browser.ts`

Finish line:

- A public marketing/demo website can be loaded and explored.
- A simple public form flow can be attempted when form submission is allowed.
- Login/CAPTCHA/auth-limited pages produce honest partial reports.
- The worker does not silently run unsafe internal/private targets.

Verification:

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

Manual verification set:

```txt
Run /demo-target
Run one simple public docs/marketing URL
Run one login-gated URL and confirm auth-limited report
Run localhost/private URL and confirm it is blocked
Run an external URL with form submissions disabled and confirm no risky submit happens
```

### Milestone 5: Evidence Storage

Goal: Make screenshots and traces durable, shareable, and small enough for real use.

Build:

- Add an artifact storage interface.
- Support local filesystem only for development.
- Support Supabase Storage or R2 for production.
- Store screenshot metadata in DB and the binary in object storage.
- Add cleanup/retention plan.
- Add size limits and per-audit artifact caps.

Files likely involved:

- New `packages/storage` or `packages/db/src/artifacts.ts`
- `packages/db/prisma/schema.prisma`
- `apps/browser-worker/src/evidence/screenshots.ts`
- `apps/web/app/audits/[auditId]/replay/[runId]/page.tsx`
- `apps/web/app/share/[shareToken]/page.tsx`

Finish line:

- Share page can show evidence after server restart.
- Screenshots are not stored only as in-memory or process-local data.

Verification:

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

Manual verification:

```txt
Run audit
Open replay
Restart web app
Open replay again
Open public share link
Confirm screenshots still load
```

### Milestone 6: Evidence-Based Report And Test Generation

Goal: Make the output feel like a real product QA artifact, not a template.

Build:

- Use collected steps, screenshots metadata, console/network errors, and run outcomes as report inputs.
- Use Fireworks structured JSON for report synthesis.
- Keep deterministic fallback report if AI is unavailable.
- Generate:
  - executive summary
  - success rate
  - time-to-value estimate
  - issues with severity/category
  - reproduction steps
  - evidence links
  - suggested fixes
  - generated Playwright test
  - bug report markdown
- Validate generated Playwright code shape before showing it.

Files likely involved:

- `packages/ai/src/prompts.ts`
- New `packages/ai/src/report.ts`
- `packages/db/src/index.ts`
- `packages/testgen/src/playwright-template.ts`
- `apps/web/app/audits/[auditId]/report/page.tsx`
- `apps/web/app/audits/[auditId]/tests/page.tsx`

Finish line:

- Reports quote only real evidence from the run.
- Recommendations are specific enough for a PM/engineer to act on.
- Generated tests are clearly marked as starter tests when selectors are inferred.

Verification:

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

Manual verification:

```txt
Run demo audit
Open report
Confirm every issue links back to run evidence
Open tests page
Confirm generated test targets observed failure path
```

### Milestone 7: Cloud Browser Provider Option

Goal: Make public deployment of real browser runs less fragile.

Build:

- Add `browserbase-stagehand` provider behind the same interface.
- Use Stagehand for observe/act/extract where it improves reliability.
- Keep local Playwright provider for development and fallback.
- Add provider health checks.
- Add provider label in audit/report UI.

Files likely involved:

- `apps/browser-worker/src/providers/browserbase-stagehand.ts`
- `apps/browser-worker/src/providers/local-playwright.ts`
- `apps/browser-worker/src/index.ts`
- `packages/types/src/browser.ts`
- `apps/web/app/audits/[auditId]/running/page.tsx`

Finish line:

- `BROWSER_PROVIDER=browserbase-stagehand` can run at least the demo target and one simple public URL.
- `BROWSER_PROVIDER=local-playwright` still works.
- `BROWSER_PROVIDER=demo` still works.

Verification:

```bash
pnpm --filter @swarmproof/browser-worker build
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

## 7. Parallel Workstreams

These can run in parallel after Milestone 0 if each session creates its own worktree/branch.

### Workstream A: Persistence And DB Adapter

Owns:

- `packages/db/**`
- `packages/types/src/audit.ts`
- API route touch points only as needed.

Goal:

- Land Prisma-backed persistence while preserving current app behavior.

### Workstream B: Worker And Browser Execution

Owns:

- `apps/browser-worker/**`
- `packages/types/src/browser.ts`
- `packages/ai/**` only for runner schemas/prompts.

Goal:

- Build real Playwright runner and callbacks.

### Workstream C: Live UI And Evidence Surfaces

Owns:

- `apps/web/app/audits/[auditId]/running/**`
- `apps/web/app/audits/[auditId]/replay/**`
- `apps/web/app/audits/[auditId]/report/**`
- `apps/web/app/audits/[auditId]/tests/**`

Goal:

- Make the UI consume live persisted worker data and display real evidence.

### Workstream D: Tests And Safety

Owns:

- test configs
- URL safety tests
- worker safety tests
- e2e smoke path

Goal:

- Keep the real agentic product from breaking the reliable demo path or violating safety boundaries.

## 8. Suggested Cold Session Goal Prompts

### Persistence Goal

```text
/goal Build SwarmProof persistent audit storage without changing the user-facing flow.

Read AGENTS.md, swarmproof_build_ready_spec.md, docs/spec-gap-analysis.md, and docs/full-product-build-plan.md. Work on a dedicated branch/worktree. Implement Prisma-backed persistence for audits, runs, steps, issues, reports, events, share tokens, and simple job records while preserving the current exported DB functions. Keep deterministic demo fallback working. Add focused tests for URL safety, persistence survival, share retrieval, and callback writes. Run pnpm test, pnpm lint, pnpm typecheck, and pnpm build.
```

### Real Worker Goal

```text
/goal Build the real SwarmProof browser worker for Playwright execution.

Read AGENTS.md, swarmproof_build_ready_spec.md, docs/spec-gap-analysis.md, and docs/full-product-build-plan.md. Work on a dedicated branch/worktree. Own apps/browser-worker and required shared browser/AI types. Add local Playwright provider, browser lifecycle, persona viewports, screenshot capture, console/network capture, callback delivery, and deterministic fallback. First make /demo-target work with real screenshots, then add generic public URL observation/action scaffolding. Run worker typecheck/build plus repo lint/typecheck/build.
```

### Live Agentic UI Goal

```text
/goal Make SwarmProof's running, replay, report, and tests pages consume live persisted worker evidence.

Read AGENTS.md, swarmproof_build_ready_spec.md, docs/spec-gap-analysis.md, and docs/full-product-build-plan.md. Work on a dedicated branch/worktree. Convert the running page to client polling, show pending/running/completed states, render real screenshot artifacts, link replay frames to steps, and make report/tests pages read persisted evidence. Preserve demo fallback. Run pnpm test, pnpm lint, pnpm typecheck, and pnpm build.
```

### Safety And Test Harness Goal

```text
/goal Add SwarmProof's safety and regression test harness for real external URL execution.

Read AGENTS.md, swarmproof_build_ready_spec.md, docs/spec-gap-analysis.md, and docs/full-product-build-plan.md. Work on a dedicated branch/worktree. Add unit tests for URL safety, persona defaults, action schema validation, generated tests, and worker callback contracts. Add Playwright e2e smoke for demo audit -> running -> report -> tests -> share. Add worker safety tests for redirects/private hosts where practical. Run pnpm test, pnpm lint, pnpm typecheck, and pnpm build.
```

## 9. Build Order If Using Only One Session

If only one Codex session is doing the work, use this sequence:

1. Milestone 0: tests.
2. Milestone 1: persistence.
3. Milestone 2: job dispatch/live polling.
4. Milestone 5: artifact storage, at least the minimal durable adapter.
5. Milestone 3: real Playwright worker on `/demo-target`.
6. Milestone 4: agentic external URL runner.
7. Milestone 6: evidence-based reports/tests.
8. Milestone 7: optional Browserbase/Stagehand provider.

Do not start with final deployment or Novus. Those matter for submission, but they do not make the product real.

## 10. Highest-Risk Engineering Problems

### SSRF And Unsafe Navigation

The current URL safety checker is a good start but not enough for a real browser worker. A real browser can follow redirects, load resources, and click links. Safety must exist at preflight, worker navigation, request interception, and redirect handling.

### Agent Reliability

Pure agent loops can get stuck or make noisy choices. The runner needs deterministic guardrails: max steps, action validation, state-change detection, same-origin rules, and clear fail conditions.

### Artifact Durability

Real screenshots cannot live only in memory. If evidence disappears, the report and share page lose trust.

### Deployment Shape

Vercel is fine for the web app, but browser execution should live in a worker service or hosted browser platform. Long-running Chromium sessions inside serverless web routes are the wrong shape.

### Cost And Abuse

Public URL testing can consume browser minutes and model tokens. The product needs rate limits, anonymous quotas, max steps, max run time, and provider health/error surfaces.

## 11. Minimum "Real Product" Acceptance Test

SwarmProof is ready to be considered a real product when this passes:

```txt
1. Open web app.
2. Submit /demo-target and goal.
3. Three personas run via a real browser worker.
4. Running page updates without refresh.
5. Report shows real screenshots and detected seeded issues.
6. Generated Playwright test is visible.
7. Share link works after server restart.
8. Submit a simple public external URL.
9. Agent navigates, observes, takes at least two real actions, captures evidence, and produces a report.
10. Submit localhost/private URL.
11. System blocks it before browser navigation.
12. Submit login-gated URL.
13. System returns an honest auth-limited report.
```

## 12. Open Decisions

- Do we have Browserbase credentials? If yes, add `browserbase-stagehand` earlier.
- Which durable database should be used: Supabase Postgres or Neon Postgres?
- Which object storage should be used: Supabase Storage or Cloudflare R2?
- Is external form submission allowed by default, or must users explicitly opt in per audit?
- Should public URL runs be anonymous, or should real external audits require a lightweight account?
- Should actual GitHub PR creation be in scope, or should the product stop at PR-ready recommendations and generated tests for now?
