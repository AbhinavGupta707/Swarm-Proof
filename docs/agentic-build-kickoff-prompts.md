# SwarmProof Agentic Build Kickoff Prompts

Date: June 19, 2026  
Purpose: Provide copy/paste `/goal` prompts for turning SwarmProof from a deterministic demo into a real browser-agent product.

Read with:

- `docs/full-product-build-plan.md`
- `docs/spec-gap-analysis.md`
- `swarmproof_build_ready_spec.md`
- `AGENTS.md`

## 1. Best Workflow

Use `/goal` sessions, not `/loop`, for this work.

The best shape is a staged workflow:

1. One baseline contract/test session.
2. One persistence/artifact-storage session.
3. One integration gate.
4. Parallel implementation sessions for worker, live UI, and report/test surfaces.
5. One integration gate.
6. One external URL agent/safety session.
7. One final product integration session.
8. Release proof only after the real product spine works.

Do not run one giant `/goal` that tries to do persistence, browser execution, UI polling, report generation, external URL safety, deployment, and Novus at once. That will create too many overlapping edits and make it hard to know which layer broke.

## 2. Worktree Rule For Cold Sessions

Each implementation session should isolate itself before editing.

Paste this instruction inside every cold-session prompt:

```text
Before editing, inspect `git status --short` and `git branch --show-current`. If this session is on the shared main checkout, create a dedicated git worktree and branch named as specified below, then continue work from that isolated worktree. If creating a worktree is unavailable but the Codex app has already placed you in a dedicated worktree, create/switch to the specified branch inside that worktree. Do not edit directly on main unless this is the named integration session.
```

Recommended branch names:

```txt
agent/swarm-contract-tests
agent/swarm-persistence-artifacts
agent/swarm-worker-playwright
agent/swarm-live-evidence-ui
agent/swarm-report-synthesis
agent/swarm-external-agent
agent/swarm-product-integration
```

## 3. Critical Sequencing

### Must Be Sequential

- Contract tests before broad rewrites.
- Persistence before live worker callbacks are relied on.
- Worker dispatch before live polling can be meaningful.
- Artifact storage before public external URL reports are trusted.
- Real `/demo-target` Playwright execution before generic public URL automation.
- External URL agent before final release proof.

### Can Run In Parallel After Persistence

- Real Playwright worker on `/demo-target`.
- Live running/replay UI consuming persisted events.
- Evidence-based report/test surfaces.

### Should Wait

- Browserbase/Stagehand provider should wait until local Playwright provider works or credentials are confirmed.
- Novus/release proof should wait until the real product spine is demonstrable.
- Actual GitHub PR creation should wait until SwarmProof reliably produces evidence-based recommendations and generated tests.

## 4. Kickoff Prompt 0: Contract Tests

Run this first, in one session.

```text
/goal Add SwarmProof baseline contract tests before deeper product rewrites.

Before editing, inspect `git status --short` and `git branch --show-current`. If this session is on the shared main checkout, create a dedicated worktree and branch named `agent/swarm-contract-tests`, then continue from that isolated worktree. If the Codex app has already placed you in a dedicated worktree, create/switch to `agent/swarm-contract-tests` inside that worktree. Do not edit directly on main.

Read AGENTS.md, swarmproof_build_ready_spec.md, docs/spec-gap-analysis.md, and docs/full-product-build-plan.md.

Mission:
Add a small but real test harness that protects the current product contracts before persistence and worker rewrites begin.

Own:
- root package scripts only as needed
- package-level test config
- package-level test files
- tiny exports needed to test existing behavior

Do not:
- rewrite persistence
- rewrite browser worker
- change UI design
- start deployment or Novus work

Required tests:
1. URL safety blocks localhost, 127.0.0.1, private IPv4 ranges, IPv6 localhost, metadata IPs, `.local`, `.internal`, and bare intranet hostnames.
2. URL safety allows relative `/demo-target`.
3. Default persona selection creates normal, mobile, and chaos.
4. Generated Playwright test includes `page.goto`, at least one user action, and an assertion.
5. API response helpers preserve `{ ok, data?, error? }` shape where practical.

Implementation guidance:
- Prefer Vitest for package tests.
- Keep tests fast and deterministic.
- If a function is currently private, make the smallest clean export needed rather than testing through brittle UI code.

Finish line:
- `pnpm test` runs real tests and is no longer a no-op.
- `pnpm lint` passes.
- `pnpm typecheck` passes.
- `pnpm build` passes or any sandbox-only build issue is documented exactly.

Final response:
- Summarize files changed.
- List every validation command and result.
- State what the next session can safely assume.
```

## 5. Kickoff Prompt 1: Persistence And Minimal Artifact Storage

Run this after Prompt 0 is complete and integrated.

```text
/goal Build SwarmProof persistent audit storage and minimal durable artifacts.

Before editing, inspect `git status --short` and `git branch --show-current`. If this session is on the shared main checkout, create a dedicated worktree and branch named `agent/swarm-persistence-artifacts`, then continue from that isolated worktree. If the Codex app has already placed you in a dedicated worktree, create/switch to `agent/swarm-persistence-artifacts` inside that worktree. Do not edit directly on main.

Read AGENTS.md, swarmproof_build_ready_spec.md, docs/spec-gap-analysis.md, docs/full-product-build-plan.md, and docs/agentic-build-kickoff-prompts.md.

Mission:
Replace volatile in-memory audit state with a DB-backed architecture that still preserves the current deterministic demo path when no external services are configured. Add the minimum artifact abstraction needed for screenshots/evidence to survive restarts.

Own:
- `packages/db/**`
- `packages/types/src/audit.ts`
- `packages/types/src/browser.ts` only where storage/callback contracts require it
- API route touch points under `apps/web/app/api/**` only as needed
- optional new storage helper/package if simpler than folding artifacts into `packages/db`

Do not:
- build the real Playwright worker yet
- build external URL agent loops yet
- redesign UI pages beyond data-contract changes
- start release proof or Novus installation

Build:
1. Add Prisma client setup or a clear Prisma-ready repository boundary.
2. Extend `packages/db/prisma/schema.prisma` for normalized URL, max steps, provider, preflight JSON, run mode, step status, artifact metadata, and simple job records.
3. Preserve the existing exported DB function surface where practical:
   - `createAudit`
   - `runPreflight`
   - `startAuditRun`
   - `getAuditOverview`
   - `getAuditEvents`
   - `generateAuditReport`
   - `createShare`
   - `getSharedReport`
   - `appendEvent`
   - `recordWorkerStep`
   - `completeWorkerRun`
4. Keep a memory/demo adapter for local fallback and tests when `DATABASE_URL` is absent.
5. Add persistent share-token behavior when a DB is configured.
6. Add minimal artifact storage abstraction. For local/dev, DB-stored data URLs or local filesystem are acceptable; document production storage envs for Supabase Storage or R2 if not fully implemented.
7. Add tests for persistence contracts, share retrieval, event sanitization, and worker callback writes.

Finish line:
- Current deterministic demo path still works.
- A DB-configured audit can persist runs, steps, issues, events, reports, and share tokens.
- Worker callback routes write through the persistence boundary.
- `pnpm test`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` pass.

Final response:
- State whether persistence is fully DB-backed or DB-ready with fallback.
- State exact env vars needed.
- State what worker/UI sessions can assume about stored data.
```

## 6. Integration Prompt A: Merge Tests And Persistence

Run this in the main session after Prompts 0 and 1 complete.

```text
/goal Integrate SwarmProof contract tests and persistence/artifact work.

Read AGENTS.md, docs/spec-gap-analysis.md, docs/full-product-build-plan.md, and docs/agentic-build-kickoff-prompts.md. Work in the main integration checkout unless the user instructs otherwise.

Mission:
Inspect branches `agent/swarm-contract-tests` and `agent/swarm-persistence-artifacts`, merge the best implementation into main, resolve conflicts, and verify the deterministic product path still works.

Required steps:
1. Inspect `git status --short`.
2. Inspect each branch diff before merging.
3. Merge contract tests first.
4. Run `pnpm test`.
5. Merge persistence/artifacts.
6. Run `pnpm test`, `pnpm lint`, `pnpm typecheck`, and `pnpm build`.
7. Smoke the API path if practical: create audit, preflight, run, get events, get report, create share, open share data.

Finish line:
- Main has real tests.
- Main has persistence/artifact boundary.
- Deterministic demo still works.
- Worker/UI sessions can branch from a clean verified main.
```

## 7. Kickoff Prompt 2A: Real Playwright Worker

Run this after Integration Prompt A.

```text
/goal Build SwarmProof's real Playwright browser worker for the built-in demo target.

Before editing, inspect `git status --short` and `git branch --show-current`. If this session is on the shared main checkout, create a dedicated worktree and branch named `agent/swarm-worker-playwright`, then continue from that isolated worktree. If the Codex app has already placed you in a dedicated worktree, create/switch to `agent/swarm-worker-playwright` inside that worktree. Do not edit directly on main.

Read AGENTS.md, swarmproof_build_ready_spec.md, docs/spec-gap-analysis.md, docs/full-product-build-plan.md, and docs/agentic-build-kickoff-prompts.md.

Mission:
Replace the browser worker's deterministic-only behavior with a real local Playwright provider for `/demo-target`, while preserving deterministic fallback when browser launch or configuration fails.

Own:
- `apps/browser-worker/**`
- `packages/types/src/browser.ts`
- `packages/types/src/agent.ts` only if persona contracts require it
- `packages/ai/**` only for schemas/prompts needed by worker scaffolding

Do not:
- rewrite the web UI
- rewrite DB persistence
- build generic external URL agent loop before `/demo-target` real browser execution works
- start Browserbase/Stagehand unless local Playwright is working and credentials are available

Build:
1. Add Playwright dependency and worker build support.
2. Add provider interface with `demo` and `local-playwright`.
3. Implement browser lifecycle: launch, context per persona, viewport/device mode, console listener, network listener, cleanup.
4. Implement real `/demo-target` runner:
   - normal reaches invite ambiguity
   - mobile captures hidden CTA or viewport issue
   - chaos double-clicks create project and tests invalid email
5. Capture real screenshots after meaningful steps.
6. Send step and complete callbacks to the existing web callback endpoints.
7. Include console/network issue payloads where available.
8. Keep deterministic fallback explicit and tested.

Finish line:
- Worker `/health` reports provider state.
- With web app running and `BROWSER_WORKER_URL` configured, `/demo-target` produces real screenshot evidence.
- `pnpm --filter @swarmproof/browser-worker build` passes.
- `pnpm --filter @swarmproof/browser-worker typecheck` passes.
- Repo `pnpm test`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` pass where practical.

Final response:
- State how to start worker and web app together.
- State how to tell real Playwright screenshots from deterministic fallback.
```

## 8. Kickoff Prompt 2B: Live Evidence UI

Can run in parallel with Prompt 2A after Integration Prompt A.

```text
/goal Make SwarmProof's running, replay, report, and tests pages consume live persisted evidence.

Before editing, inspect `git status --short` and `git branch --show-current`. If this session is on the shared main checkout, create a dedicated worktree and branch named `agent/swarm-live-evidence-ui`, then continue from that isolated worktree. If the Codex app has already placed you in a dedicated worktree, create/switch to `agent/swarm-live-evidence-ui` inside that worktree. Do not edit directly on main.

Read AGENTS.md, swarmproof_build_ready_spec.md, docs/spec-gap-analysis.md, docs/full-product-build-plan.md, and docs/agentic-build-kickoff-prompts.md.

Mission:
Turn the visible audit UI into a real live product surface driven by persisted run/event/evidence data.

Own:
- `apps/web/app/audits/[auditId]/running/**`
- `apps/web/app/audits/[auditId]/replay/**`
- `apps/web/app/audits/[auditId]/report/**`
- `apps/web/app/audits/[auditId]/tests/**`
- small presenter/data helpers in `apps/web/lib/**`

Do not:
- rewrite DB adapter
- rewrite browser worker
- change landing/demo target unless a link is broken
- start release proof or Novus installation

Build:
1. Convert running dashboard to client polling against `/api/audits/:id/events`.
2. Show pending, running, completed, failed, blocked, and cancelled states.
3. Show latest screenshot/artifact per persona.
4. Link replay frames to persisted steps.
5. Make report/tests pages robust to partially completed runs.
6. Surface provider/mode honestly: deterministic fallback, local Playwright, or external provider.
7. Add empty/loading/error states that do not break the demo.

Finish line:
- Running page updates without manual refresh.
- Replay shows step-linked evidence.
- Report/tests can render persisted worker evidence.
- Deterministic fallback remains presentable.
- `pnpm test`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` pass.

Final response:
- Summarize UI state handling.
- List route smoke checks performed.
```

## 9. Kickoff Prompt 2C: Evidence-Based Reports And Testgen

Can run in parallel with Prompt 2A after Integration Prompt A, but should avoid touching worker internals.

```text
/goal Upgrade SwarmProof reports, recommendations, bug exports, and generated tests to use run evidence.

Before editing, inspect `git status --short` and `git branch --show-current`. If this session is on the shared main checkout, create a dedicated worktree and branch named `agent/swarm-report-synthesis`, then continue from that isolated worktree. If the Codex app has already placed you in a dedicated worktree, create/switch to `agent/swarm-report-synthesis` inside that worktree. Do not edit directly on main.

Read AGENTS.md, swarmproof_build_ready_spec.md, docs/spec-gap-analysis.md, docs/full-product-build-plan.md, and docs/agentic-build-kickoff-prompts.md.

Mission:
Make the report and generated tests evidence-based rather than purely template-based, while preserving deterministic fallback when AI is unavailable.

Own:
- `packages/ai/**`
- `packages/testgen/**`
- report-related helpers in `packages/db/**` only as needed
- `apps/web/app/audits/[auditId]/report/**`
- `apps/web/app/audits/[auditId]/tests/**`

Do not:
- rewrite browser worker
- rewrite persistence architecture
- build GitHub PR creation

Build:
1. Define report input schema from runs, steps, issues, artifacts, console errors, and network failures.
2. Use Fireworks through the provider wrapper for structured JSON report synthesis.
3. Keep deterministic report fallback if `FIREWORKS_API_KEY` is missing or JSON parsing fails.
4. Improve generated Playwright test output from observed steps.
5. Mark uncertain selectors with clear comments.
6. Generate PM-readable bug markdown with reproduction steps and evidence references.
7. Add tests for report fallback and generated test shape.

Finish line:
- Reports use actual evidence fields where available.
- Generated tests reflect observed run steps.
- AI failure does not break report generation.
- `pnpm test`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` pass.

Final response:
- State which outputs are AI-backed versus deterministic fallback.
- State exact test coverage added.
```

## 10. Integration Prompt B: Merge Worker, Live UI, Reports

Run this after Prompts 2A, 2B, and 2C complete.

```text
/goal Integrate SwarmProof real worker, live evidence UI, and evidence-based report work.

Read AGENTS.md, docs/spec-gap-analysis.md, docs/full-product-build-plan.md, and docs/agentic-build-kickoff-prompts.md. Work in the main integration checkout unless the user instructs otherwise.

Mission:
Merge the real Playwright worker, live evidence UI, and report synthesis branches into main, preserving the real browser execution path and deterministic fallback.

Required steps:
1. Inspect `git status --short`.
2. Inspect branch diffs before merging:
   - `agent/swarm-worker-playwright`
   - `agent/swarm-live-evidence-ui`
   - `agent/swarm-report-synthesis`
3. Merge worker first, then UI, then report synthesis.
4. Resolve conflicts according to `docs/full-product-build-plan.md`.
5. Run `pnpm test`, `pnpm lint`, `pnpm typecheck`, and `pnpm build`.
6. Start web app and worker if practical.
7. Smoke `/demo-target` through real Playwright:
   - create audit
   - preflight
   - run
   - observe events
   - open report
   - open tests
   - open replay
   - create/open share

Finish line:
- Main can run the built-in demo target with real browser evidence when worker is configured.
- Main still has deterministic fallback when worker is absent.
- Live UI and report pages use persisted evidence.
```

## 11. Kickoff Prompt 3: Agentic External URL Runner And Safety

Run this only after Integration Prompt B.

```text
/goal Build SwarmProof's agentic external public URL runner with strict safety controls.

Before editing, inspect `git status --short` and `git branch --show-current`. If this session is on the shared main checkout, create a dedicated worktree and branch named `agent/swarm-external-agent`, then continue from that isolated worktree. If the Codex app has already placed you in a dedicated worktree, create/switch to `agent/swarm-external-agent` inside that worktree. Do not edit directly on main.

Read AGENTS.md, swarmproof_build_ready_spec.md, docs/spec-gap-analysis.md, docs/full-product-build-plan.md, and docs/agentic-build-kickoff-prompts.md.

Mission:
Extend the working browser runner from `/demo-target` to safe public unauthenticated external URLs. The product should honestly report auth/CAPTCHA/login blocks and should never browse private/internal hosts.

Own:
- `apps/browser-worker/src/agents/**`
- `apps/browser-worker/src/runners/**`
- `apps/browser-worker/src/evidence/**`
- `packages/ai/src/prompts.ts`
- `packages/ai/src/schemas.ts`
- `packages/types/src/browser.ts`
- safety tests as needed

Do not:
- add authenticated private app support
- add CAPTCHA/2FA bypass
- add security scanning claims
- add GitHub PR creation
- weaken deterministic demo fallback

Build:
1. Generic page observation: URL, title, visible text, semantic elements, forms, screenshot, console/network errors.
2. Strict action schema validation.
3. Fireworks-backed next-action selection through the AI provider wrapper.
4. Deterministic heuristic fallback when model output fails.
5. Action executor for click, fill, select, press, goto, wait, back, screenshot, done, fail.
6. Same-origin navigation rules by default.
7. Request interception to block private/internal/metadata destinations after redirects and subresource requests.
8. Auth/CAPTCHA/login/payment-wall detection that produces an auth-limited report.
9. Stuck detection for repeated actions or no page-state change.
10. Issue detection for blocked goals, console errors, network failures, hidden/unclickable CTAs, validation problems, and duplicate-submit behavior where permitted.
11. Tests for safety and schema validation.

Finish line:
- `/demo-target` still works.
- One simple public external URL can be observed and explored.
- One login-gated URL produces an honest auth-limited report.
- Localhost/private/internal targets are blocked before browser navigation and during worker navigation.
- `pnpm test`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` pass.

Final response:
- List public URLs used for manual verification.
- State exact safety cases tested.
- State known limits for external sites.
```

## 12. Integration Prompt C: Full Product Integration

Run after Prompt 3 completes.

```text
/goal Integrate SwarmProof's external URL agent into a full working product.

Read AGENTS.md, docs/spec-gap-analysis.md, docs/full-product-build-plan.md, and docs/agentic-build-kickoff-prompts.md. Work in the main integration checkout unless the user instructs otherwise.

Mission:
Merge `agent/swarm-external-agent`, verify the complete product spine, and document any remaining blockers before release proof.

Required checks:
1. Inspect diff before merging.
2. Merge safely.
3. Run `pnpm test`.
4. Run `pnpm lint`.
5. Run `pnpm typecheck`.
6. Run `pnpm build`.
7. Smoke built-in demo target with worker configured.
8. Smoke one simple public external URL.
9. Smoke one login-gated/auth-limited URL.
10. Smoke blocked localhost/private URL.
11. Verify report, replay, generated test, and share link for the real worker path.

Finish line:
- Main has a real browser-agent product spine.
- Public URL agent is honest and safety-gated.
- Deterministic fallback remains available.
- Remaining release work is deployment/Novus/submission, not core product execution.
```

## 13. Optional Prompt 4: Browserbase/Stagehand Provider

Run only if Browserbase credentials are available or local browser deployment is proving too fragile.

```text
/goal Add Browserbase/Stagehand provider support to SwarmProof's browser worker.

Before editing, inspect `git status --short` and `git branch --show-current`. If this session is on the shared main checkout, create a dedicated worktree and branch named `agent/swarm-browserbase-stagehand`, then continue from that isolated worktree. If the Codex app has already placed you in a dedicated worktree, create/switch to `agent/swarm-browserbase-stagehand` inside that worktree. Do not edit directly on main.

Read AGENTS.md, docs/full-product-build-plan.md, and the official Browserbase/Stagehand docs as needed.

Mission:
Add `BROWSER_PROVIDER=browserbase-stagehand` behind the existing provider interface without breaking `demo` or `local-playwright`.

Build:
1. Add provider env validation for Browserbase/Stagehand.
2. Implement provider health check.
3. Run at least `/demo-target` and one simple public external URL through the provider.
4. Preserve local Playwright as default development provider.
5. Add docs for required env vars and provider limits.

Finish line:
- `BROWSER_PROVIDER=browserbase-stagehand` works when credentials exist.
- `BROWSER_PROVIDER=local-playwright` still works.
- `BROWSER_PROVIDER=demo` still works.
- Validation commands pass.
```

## 14. Release Prompt Later

Do not run this until Integration Prompt C passes.

```text
/goal Prepare SwarmProof for public release and Devpost submission.

Read AGENTS.md, swarmproof_build_ready_spec.md, docs/spec-gap-analysis.md, docs/full-product-build-plan.md, and docs/agentic-build-kickoff-prompts.md.

Mission:
Deploy the now-working product, wire Novus proof, validate public URL behavior, and prepare submission assets.

Finish line:
- Public URL works for a stranger.
- Built-in demo target runs end to end.
- At least one external URL run is demonstrable or documented with honest limitations.
- Novus dashboard screenshot exists.
- Demo script and Devpost copy exist.
- Final checks pass.
```

## 15. Recommended Actual Run Order

If you want maximum safety:

1. Prompt 0.
2. Integration Prompt A for tests only if needed.
3. Prompt 1.
4. Integration Prompt A.
5. Prompts 2A, 2B, and 2C in parallel.
6. Integration Prompt B.
7. Prompt 3.
8. Integration Prompt C.
9. Optional Prompt 4.
10. Release Prompt later.

If you want maximum speed:

1. Prompt 0.
2. Prompt 1.
3. Integration Prompt A.
4. Prompts 2A and 2B in parallel.
5. Integration Prompt B.
6. Prompt 3.
7. Prompt 2C if reports still feel too templated.
8. Integration Prompt C.

My recommendation for this project is the maximum-safety path through Prompt 1, then parallelize Prompts 2A/2B/2C. That gives the real product spine the best chance of surviving overnight work without turning integration into archaeology.
