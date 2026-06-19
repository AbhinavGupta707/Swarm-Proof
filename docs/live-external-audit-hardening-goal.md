# Live External Audit Hardening Goal Prompt

Use this prompt in a fresh Codex session.

```text
/goal Harden SwarmProof live external audits so public URL runs finish reliably.

Before editing, inspect `git status --short` and `git branch --show-current`. If on shared main, create a dedicated worktree/branch named `agent/live-external-audit-hardening` and continue there. If already in an isolated Codex worktree, switch/create that branch there. Preserve unrelated changes.

Read first:
- AGENTS.md
- swarmproof_build_ready_spec.md
- docs/live-external-audit-hardening-brief.md
- docs/live-worker.md
- docs/data-foundation.md

Mission:
Fix the live external-audit reliability issues found on Apple, Vercel, and Stripe. The product must browse real safe public sites through the Railway Playwright worker, but every run/audit must end cleanly with partial reports when needed. Do not run the Chrome live demo in this goal.

Build sequentially:
1. Inspect worker loop, callback routes, persistence adapter, report generation, and running/report UI.
2. Add persona/audit timeouts and watchdog finalization so no audit stays RUNNING forever.
3. Cap worker execution to concurrency 1 or otherwise serialize personas safely for Railway.
4. Add callback retry/backoff and idempotent callback handling.
5. Harden unsafe action blocking for signup/login/start deploying/add to cart/checkout/payment/contact sales/book demo/start trial/create account.
6. Generate partial reports for crashed, blocked, timed-out, or partially complete runs.
7. Keep audit overview/events/report endpoints responsive; reduce large Supabase REST payload/read pressure.
8. Update UI copy/states for timed out, blocked, worker crashed, partial report ready, and retry-ready states.
9. Add focused tests for timeout finalization, callback idempotency, unsafe-action blocking, partial reports, and persistence read shape.

Keep:
- deterministic `/demo-target` fully working
- safe public URL preflight
- privacy-safe events/artifacts
- existing API contracts where practical

Verify:
- `pnpm test`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`
- `docker build -f Dockerfile.worker -t swarmproof-browser-worker:verify .`
- local worker container `/health` when possible

Deploy:
Commit in clear sequential commits, push to GitHub, let Vercel/Railway auto-deploy or redeploy if available. Verify Vercel production is ready and Railway `/health` returns 200 with `provider: local-playwright` and `playwrightAvailable: true`.

Stop after deployment verification. Do not run Chrome live demo. Final response must list changed files, tests, deployed status, remaining risks, and next manual demo steps.
```
