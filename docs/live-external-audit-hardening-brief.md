# Live External Audit Hardening Brief

## Why This Exists

SwarmProof now has a real deployed external-audit path: the web app can dispatch to the Railway browser worker, and the worker can browse public websites with Playwright. The current external mode is not demo-reliable yet. It can browse real sites, but live tests showed hanging runs, fragile worker concurrency, unsafe exploratory clicks, callback failures, and Supabase read timeouts.

Use this file as the source of truth for the next hardening pass. Do not start with a Chrome live demo. Build, validate, push/deploy, verify service health, then stop. A separate Chrome demo should happen after deployment.

## Live Findings From June 19, 2026

Production web app:

- `https://swarm-proof-web.vercel.app`

Production worker:

- `https://swarmproofbrowser-worker-production.up.railway.app/health`
- Health was verified as `200`, `provider: local-playwright`, `playwrightAvailable: true`, personas `normal`, `mobile`, `chaos`.

### Apple Audit

- Audit id: `audit_3682a2c78e954c25b5`
- Target: `https://www.apple.com/macbook-air/`
- Goal: explore MacBook buying path and stop before cart, checkout, payment, login, or private data.
- Result: real browser actions happened. Chaos succeeded with 5 steps. Normal and mobile became `BLOCKED`.
- Failure evidence:
  - `Callback failed: 500 Internal Server Error`
  - `page.evaluate: Target crashed`
  - Report included "External Playwright execution did not complete".

### Vercel Audit

- Audit id: `audit_96265cec9fcf432488`
- Target: `https://vercel.com/`
- Goal: explore deploying a Next.js app and pricing, stop before signup, login, payment, or private data.
- Result: remained `RUNNING` after about 4 minutes.
- Failure evidence:
  - Normal clicked `Pricing`, then `Start Deploying`, then `Sign Up`.
  - Mobile navigated through templates/docs.
  - Chaos fell back after `page.evaluate: Target crashed`.
- Product problem: signup/start-deploying were treated as safe exploratory actions even though the goal explicitly said to stop before signup/login.

### Stripe Audit

- Audit id: `audit_13a08be1bbcf4a9483`
- Target: `https://stripe.com/pricing`
- Goal: explore public pricing/docs only, stop before signup, login, contact sales, payment, or private data.
- Result: remained `RUNNING`; API reads intermittently failed.
- Failure evidence:
  - Supabase REST persistence returned `500` with Postgres code `57014`: `canceling statement due to statement timeout`.
  - Runs had partial steps but no final report state.

## Required Product Behavior

The reliable live experience should be:

1. User enters a safe public URL and a goal.
2. SwarmProof dispatches personas to the worker.
3. The worker explores public, non-committing paths only.
4. Every persona reaches a final status: `SUCCEEDED`, `FAILED`, `BLOCKED`, or `TIMED_OUT`.
5. Every audit reaches a final status. No endless `RUNNING`.
6. A partial report is generated even when one or more personas fail.
7. The UI explains worker crash, timeout, safety stop, retry availability, and partial evidence clearly.
8. API reads stay responsive under live audit load.

## Build Priorities

### P0 - Must Fix Before Next Live Demo

- Add persona-level and audit-level timeouts/watchdogs.
- Make run completion idempotent and always call finalization logic.
- Sequentialize or cap worker concurrency to 1 for Railway/free-tier stability.
- Add callback retry/backoff and idempotent callback handling.
- Block unsafe public actions:
  - signup, sign up, login, log in, start deploying, add to cart, add to bag, checkout, subscribe, pay, place order, contact sales, book demo, request demo, schedule, create account, start trial.
- Generate partial reports for completed, blocked, crashed, or timed-out runs.
- Keep `/audits/[id]/running`, `/report`, `/share`, and `/tests` responsive even with many steps/events.

### P1 - Should Fix In Same Pass If Feasible

- Add retry action or retry copy for failed personas.
- Improve external report language:
  - what each persona tried
  - where it stopped
  - what was skipped for safety
  - what evidence was captured
  - product recommendations and PR-ready suggestions
- Add better worker/job observability:
  - `queuedAt`, `startedAt`, `lockedAt`, `heartbeatAt`, `timedOutAt`, `retryCount`, `lastError`.
- Add tests for timeout finalization, callback idempotency, unsafe-action blocking, partial reports, and Supabase payload/read shape.

## Implementation Shape

Prefer one sequential goal with checkpoints rather than parallel sessions. These files are interdependent:

- `apps/browser-worker/src/**`
- `packages/db/src/index.ts`
- `packages/types/src/**`
- `apps/web/app/api/**`
- `apps/web/app/audits/**`
- `apps/web/app/share/**`
- `packages/testgen/**`

Suggested checkpoints:

1. Inspect current worker run loop, callback routes, persistence adapter, and report generation.
2. Define final statuses and timeout/job contracts in shared types.
3. Implement worker sequential execution and hard step/run timeout behavior.
4. Implement callback retries/idempotency and finalization safety.
5. Harden unsafe action filtering.
6. Reduce persistence read/write pressure and avoid loading giant audit blobs when polling.
7. Update running/report UI states for timed out, blocked, partial, and retry-ready audits.
8. Add focused tests.
9. Validate, push, verify deployed health, and stop.

## Non-Goals

- Do not redesign the product.
- Do not remove the deterministic `/demo-target` path.
- Do not run the Chrome live demo as part of the build goal.
- Do not add checkout/payment/private-data support.
- Do not claim private app support, security scanning, accessibility certification, or human-equivalent usability testing.

## Validation Gate

Run:

- `pnpm test`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`
- worker Docker build: `docker build -f Dockerfile.worker -t swarmproof-browser-worker:verify .`
- local worker container health check when possible
- production health checks after push/deploy:
  - Vercel production ready for `https://swarm-proof-web.vercel.app`
  - Railway worker `/health` returns `200`, `provider: local-playwright`, and `playwrightAvailable: true`

## Finish Line

- `main` is pushed.
- Vercel and Railway are redeployed or confirmed auto-deployed.
- Worker health is green.
- No Chrome live demo has been run yet.
- Final response lists changes, tests, deployment status, remaining risks, and the exact next manual demo steps.
