# SwarmProof Spec Gap Analysis

Date: June 19, 2026  
Audited branch: `main`  
Audited commit: `a0386f9` (`Integrate SwarmProof UI and execution workstreams`)

Sources read:

- `AGENTS.md`
- `swarmproof_build_ready_spec.md`
- `swarmproof_codex_execution_brief.md`
- `docs/architecture.md`
- `docs/codex-runbook.md`

Legend:

- DONE: Implemented enough to count for the current local product.
- PARTIAL: User-visible slice exists, but important production or spec depth is missing.
- MISSING: Not implemented in the current checkout.
- RISKY: Implemented, but likely to fail a public deployment, judging demo, or future build step without more work.

## 1. Current State Summary

SwarmProof is now a coherent local MVP with a polished public-facing product loop: landing page, new audit form, deterministic demo run, running dashboard, report, replay, generated tests, share page, privacy page, and Novus proof page. The merged UI is credible and the core judged demo path exists in code.

The implementation is still best described as a local deterministic product demo, not a release-verified public product. Audit data lives in `globalThis.__swarmproofStore` inside `packages/db/src/index.ts`, so audits and share tokens are volatile across server restarts, serverless instances, and deployments. The Prisma schema exists, but no Prisma client or persisted adapter is wired into the runtime.

The browser worker exists under `apps/browser-worker/src/index.ts`, but it runs deterministic scripted callbacks. The web app route `POST /api/audits/[auditId]/run` calls `startAuditRun()` directly and does not dispatch jobs to `BROWSER_WORKER_URL`. External URL auditing passes safety preflight when allowed, then becomes a blocked deterministic report saying the worker is unconfigured.

The Novus proof is currently a local event-contract page. Event names and sanitized local logging exist, but there is no actual Novus SDK/install wiring, no environment documentation for Novus keys, and no dashboard screenshot artifact. Required event names for `replay_opened` and `test_exported` are declared but not emitted by the current replay/test/export UI flows.

There are no real unit or e2e tests in the repo yet. `pnpm lint`, `pnpm typecheck`, and `pnpm build` are the meaningful gates right now; `pnpm test` is expected to be a no-op until test scripts are added.

Current validation results from this audit pass:

| Command | Result | Notes |
| --- | --- | --- |
| `pnpm lint` | PASS | Workspace TypeScript lint gates passed. |
| `pnpm typecheck` | PASS | Workspace TypeScript checks passed. |
| `pnpm test` | PASS, no-op | Root script ran, but no package currently defines tests. |
| `pnpm build` | PASS with escalation | Initial sandboxed build failed because Turbopack was not allowed to create a process and bind a local port. The same command passed outside the sandbox. |

## 2. Spec Compliance Table

### Hackathon Definition Of Done

| Requirement | Status | Evidence | Gap |
| --- | --- | --- | --- |
| 1. Accept a product URL and goal | DONE | `apps/web/app/audits/new/audit-form.tsx`, `apps/web/app/api/audits/route.ts` | External URLs are accepted only into preflight and blocked fallback execution unless a real worker is added. |
| 2. Run against built-in demo target end-to-end | DONE | `/demo-target`, `/demo-target/signup`, `/demo-target/projects/new`, `/demo-target/invite`, deterministic runs in `packages/db/src/index.ts` | Demo fixture paths `/demo-target/onboarding` and `/demo-target/projects` are not present. |
| 3. Launch at least 3 personas | DONE | `packages/types/src/agent.ts`, `startAuditRun()` defaults to normal, mobile, chaos | Impatient and accessibility-lite are accepted as modes but have generic fallback behavior. |
| 4. Produce per-persona logs and screenshots | PARTIAL | Step logs and SVG evidence frames are generated in `fallbackFrame()` | No real Playwright screenshots, trace, video, console logs, or network capture yet. |
| 5. Detect at least one seeded issue | DONE | Mobile hidden CTA, ambiguous invite CTA, duplicate submit, invalid email issues are scripted | Detection is deterministic rather than derived from actual browser state. |
| 6. Generate PM-readable report | DONE | `generateAuditReport()`, report page, markdown bug export | Report is template/deterministic and does not use Fireworks evidence synthesis yet. |
| 7. Generate a Playwright test | DONE | `buildGeneratedTest()` and `packages/testgen/src/playwright-template.ts` | Test is a starter template with an explicit TODO, not validated by Playwright. |
| 8. Create a public shareable report | PARTIAL/RISKY | `createShare()`, `/share/[shareToken]`, `/api/share/[shareToken]` | Share tokens are in memory and will not survive deployment restarts or multi-instance serving. |
| 9. Emit Novus events for submitted/run/step/issue/report/export | PARTIAL | `packages/events/src/event-names.ts`, `appendEvent()` sanitized local log, `/novus-proof` | Actual Novus install is missing. `replay_opened` and `test_exported` are not emitted by UI flows. |

### Major Product And Architecture Requirements

| Area | Status | Current Implementation | Needed To Match Spec |
| --- | --- | --- | --- |
| Public deployed URL | MISSING | No deployment docs, Vercel config notes, or public URL evidence. | Deploy web app, verify stranger-accessible demo path, document URL and environment. |
| Novus installed with dashboard screenshot | MISSING | Local proof page only. | Install/wire Novus or Pendo/Novus SDK per official flow, track safe events, capture dashboard screenshot. |
| Persistent database | PARTIAL/RISKY | Prisma schema exists. Runtime uses memory adapter. | Add Prisma client/migrations, persist audits/runs/steps/issues/reports/events/share tokens. |
| Artifact storage | MISSING | Screenshots are inline SVG data URLs. | Add Supabase Storage/R2 or durable artifact references for screenshots/traces. |
| Browser execution | PARTIAL | Worker HTTP scaffold exists, deterministic runner only. Web app does not call worker. | Add dispatch to worker, real Playwright runner, screenshots, console/network capture, callback verification. |
| Fireworks provider | PARTIAL | `packages/ai/src/provider.ts` wraps Fireworks with fallback. | Use provider in planner/runner/report flows with schemas and deterministic fallback. |
| Queue/realtime | PARTIAL | Synchronous run start and events endpoint exist. Running page is server-rendered. | Add worker queue dispatch plus polling client or realtime updates on running page. |
| URL safety | PARTIAL | Blocks localhost, private/internal hosts, metadata host, relative non-demo paths. | Add tests, DNS resolution protection, rate limits, clearer auth-limited external report. |
| Privacy/safety copy | DONE/PARTIAL | `/settings/privacy` and event prop sanitizer exist. | Add delete audit, rate limit, persistent data retention rules, and public deployment policy copy. |
| Generated reports/tests | DONE/PARTIAL | Report, markdown export, tests page, share page exist. | Validate generated tests syntactically and emit export tracking. |
| Demo target | DONE/PARTIAL | Key seeded routes and bugs exist. | Add optional `/demo-target/onboarding` and `/demo-target/projects` to match fixture spec and improve flow continuity. |
| Test coverage | MISSING | No test scripts or test files. | Add unit tests for URL safety/personas/testgen and e2e smoke for demo audit/share. |
| Devpost assets | MISSING | No demo script, submission copy, known limitations, or screenshot checklist docs. | Add release docs and capture demo video/Novus dashboard proof. |

## 3. Highest-Risk Gaps

1. Public deployment and Novus proof are not done.
   The hackathon requires a public URL and Novus dashboard screenshot. These are higher priority than adding deeper browser intelligence because they directly affect submission eligibility and shippedness.

2. In-memory storage makes share links unreliable in production.
   On Vercel/serverless, a created audit may disappear between requests or across instances. The current share feature looks complete locally but is fragile without Postgres persistence.

3. Browser execution is scripted rather than real.
   The spec permits deterministic demo fallback, but the product promise is AI browser users. Judges may accept a strong demo mode, but the story is stronger if at least the internal demo target can be driven by a real Playwright worker with screenshots.

4. Novus events are local-only.
   The app has a safe event model, but no installed SDK and incomplete event coverage. This risks failing the explicit Novus requirement.

5. There is no automated regression coverage.
   The exact flows that matter most for the demo are currently protected only by manual smoke checks and TypeScript compilation.

6. External URL flow can disappoint users.
   The app accepts external URLs, but the result is effectively "worker unconfigured." This is acceptable if framed as demo mode, but it should be more explicit in UI and submission copy.

## 4. Recommended Next Build Sequence

### Milestone 1: Release Proof And Submission Shell

Goal: Make the project eligible and judgeable from the public internet.

Build:

- Add `docs/deployment.md` with Vercel deployment steps, required environment variables, and known worker limitations.
- Add `docs/demo-script.md` with a 2-3 minute demo video script.
- Add `docs/devpost-submission.md` with project description, who it is for, tools used, what was learned, and known limitations.
- Wire actual Novus/Pendo install through a small wrapper in `packages/events` and web app initialization, or document the exact official activation blocker if credentials are unavailable.
- Emit required safe events from report/replay/test/share actions.

Finish line:

- Public web URL opens.
- `/audits/new?demo=1` can create and show a demo audit.
- `/novus-proof` plus a real Novus dashboard screenshot can be used in the submission.

### Milestone 2: Persistence For Audits And Share Links

Goal: Make the public demo reliable after deployment.

Build:

- Replace the runtime memory adapter with a Prisma-backed adapter while preserving the current function surface in `packages/db/src/index.ts`.
- Persist audits, runs, steps, issues, reports, event logs, and share tokens.
- Keep deterministic demo fallback available when external worker credentials are absent.
- Add delete-audit or retention stub if time permits.

Finish line:

- A created audit survives a server restart.
- A share link remains valid after reload and across new server processes.

### Milestone 3: Minimal Automated Coverage

Goal: Protect the public demo path before adding deeper runtime complexity.

Build:

- Add Vitest or Node test scripts for `packages/db` and `packages/testgen`.
- Test URL safety blocks localhost/private/internal/metadata URLs and allows `/demo-target`.
- Test persona normalization includes normal/mobile/chaos by default.
- Test generated Playwright string includes a target and a visible assertion.
- Add Playwright e2e smoke for create demo audit, running, report, tests, share.

Finish line:

- `pnpm test` runs real tests.
- Demo smoke fails fast if the judged path breaks.

### Milestone 4: Real Browser Worker For The Demo Target

Goal: Upgrade from scripted evidence frames to real browser evidence without betting the whole submission on external sites.

Build:

- Update `POST /api/audits/[auditId]/run` to dispatch to `BROWSER_WORKER_URL` when configured, otherwise use deterministic fallback.
- Implement local Playwright navigation for `/demo-target`.
- Capture real screenshots and basic console/network failures.
- Post step/complete callbacks to the existing worker callback routes.
- Keep deterministic fallback as a visible demo mode.

Finish line:

- Demo target can be exercised by real Playwright in local or deployed worker mode.
- Evidence frames are real screenshots when worker is active.

### Milestone 5: Final Product Polish

Goal: Improve perceived craft and reduce judge confusion.

Build:

- Add missing demo target continuity routes `/demo-target/onboarding` and `/demo-target/projects`.
- Make running dashboard genuinely poll while jobs are active.
- Clarify external URL output as "public/auth-limited preflight report" when worker is unavailable.
- Add a status badge or settings panel showing storage, worker, Fireworks, and Novus configuration.

Finish line:

- A judge immediately understands which parts are live, deterministic fallback, or unconfigured.
- Demo path remains under 3 minutes.

## 5. Exact Files, Routes, And Packages Involved

### Product UI

- `apps/web/app/page.tsx`
- `apps/web/app/audits/new/page.tsx`
- `apps/web/app/audits/new/audit-form.tsx`
- `apps/web/app/audits/[auditId]/running/page.tsx`
- `apps/web/app/audits/[auditId]/report/page.tsx`
- `apps/web/app/audits/[auditId]/replay/[runId]/page.tsx`
- `apps/web/app/audits/[auditId]/tests/page.tsx`
- `apps/web/app/share/[shareToken]/page.tsx`
- `apps/web/app/settings/privacy/page.tsx`
- `apps/web/app/novus-proof/page.tsx`

### Demo Target

- `apps/web/app/demo-target/page.tsx`
- `apps/web/app/demo-target/signup/page.tsx`
- `apps/web/app/demo-target/projects/new/page.tsx`
- `apps/web/app/demo-target/invite/page.tsx`
- Missing if strict fixture parity is desired: `apps/web/app/demo-target/onboarding/page.tsx`, `apps/web/app/demo-target/projects/page.tsx`

### APIs

- `apps/web/app/api/audits/route.ts`
- `apps/web/app/api/audits/[auditId]/preflight/route.ts`
- `apps/web/app/api/audits/[auditId]/run/route.ts`
- `apps/web/app/api/audits/[auditId]/events/route.ts`
- `apps/web/app/api/audits/[auditId]/report/route.ts`
- `apps/web/app/api/audits/[auditId]/generate-report/route.ts`
- `apps/web/app/api/audits/[auditId]/share/route.ts`
- `apps/web/app/api/share/[shareToken]/route.ts`
- `apps/web/app/api/events/route.ts`
- `apps/web/app/api/worker-callback/step/route.ts`
- `apps/web/app/api/worker-callback/complete/route.ts`

### Shared Packages

- `packages/types/src/agent.ts`
- `packages/types/src/audit.ts`
- `packages/types/src/browser.ts`
- `packages/db/src/index.ts`
- `packages/db/prisma/schema.prisma`
- `packages/events/src/event-names.ts`
- `packages/events/src/track.ts`
- `packages/ai/src/provider.ts`
- `packages/ai/src/prompts.ts`
- `packages/testgen/src/playwright-template.ts`

### Worker

- `apps/browser-worker/src/index.ts`
- `apps/browser-worker/package.json`

### Release Docs To Add

- `docs/deployment.md`
- `docs/demo-script.md`
- `docs/devpost-submission.md`
- Optional: `docs/known-limitations.md` if not folded into Devpost copy.

## 6. Verification Commands For Each Next Milestone

### Baseline Gates

Run after every meaningful milestone:

```bash
pnpm lint
pnpm typecheck
pnpm build
```

After test scripts exist:

```bash
pnpm test
```

### Milestone 1: Release Proof And Submission Shell

```bash
pnpm lint
pnpm typecheck
pnpm build
```

Manual/public checks:

```txt
Open public URL
Open /audits/new?demo=1
Start built-in demo audit
Open /audits/<id>/running
Open /audits/<id>/report
Open /audits/<id>/tests
Open /share/<shareToken>
Open /novus-proof
Capture Novus dashboard screenshot
```

### Milestone 2: Persistence

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Manual checks:

```txt
Create audit
Create share link
Restart dev server
Reload /share/<shareToken>
Confirm audit events/report still exist
```

### Milestone 3: Automated Coverage

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

Required test cases:

```txt
URL safety blocks localhost, 127.0.0.1, private ranges, metadata IPs, .local, .internal
URL safety allows /demo-target
Default personas include normal, mobile, chaos
Generated test includes page.goto and expect
E2E demo audit reaches report, tests, share
```

### Milestone 4: Real Browser Worker

```bash
pnpm --filter @swarmproof/browser-worker build
pnpm --filter @swarmproof/browser-worker typecheck
pnpm lint
pnpm typecheck
pnpm build
```

Manual checks:

```txt
Start web app
Start browser worker
Set BROWSER_WORKER_URL
Create demo audit
Confirm worker /health reports active provider
Confirm /api/worker-callback/step records real screenshot steps
Confirm report evidence uses worker artifacts, not fallback SVG frames
```

### Milestone 5: Final Product Polish

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Manual checks:

```txt
Mobile viewport for landing, audit form, running, report, share
Demo route continuity from /demo-target through signup, projects, invite
External URL blocked/fallback copy is clear and honest
Demo run completes in under 3 minutes
```
