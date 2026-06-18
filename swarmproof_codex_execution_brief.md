# SwarmProof Codex Execution Brief

This file is the operational brief for cold Codex sessions building SwarmProof for Mind the Product's World Product Day 2026 hackathon.

## 1. Hackathon Context

Source: `https://mindtheproduct.devpost.com/`

The hackathon is "Mind the Product presents World Product Day: Everyone Ships Now." The challenge is intentionally broad: ship a real working product, not a pitch deck or broken prototype. The submission deadline is June 20, 2026 at 5:00 PM BST.

Required submission assets:

- Public URL to a new working deployed project.
- 2-3 minute public or unlisted demo video.
- Confirmation that Novus.ai is installed, shown via screenshot of the Novus dashboard.
- Short written description covering what was built, who it is for, tools used, and what was learned.
- Optional build-in-public links.

Judging criteria are evenly weighted:

- Product Thinking: problem clarity, audience clarity, why it matters.
- Craft and Execution: end-to-end function, coherent UX, intentional copy.
- Originality and Ambition: sharp, specific, surprising, personally distinctive.
- Shippedness: public URL works now, measurable behavior, Novus installed.

## 2. Product Summary

SwarmProof is a public web app where a user enters a product URL and goal, then AI browser users attempt that goal across normal, mobile, impatient, and chaos personas. The product outputs live progress, screenshot evidence, UX friction, issue detection, replay/report views, and generated Playwright tests or bug reports.

The hackathon-winning story is simple:

> Everyone can ship now; SwarmProof helps everyone prove that what they shipped actually works before real users suffer.

The core demo must be reliable even if external sites block automation, so `/demo-target` is mandatory. The built-in target app should have intentional bugs that the agents reliably discover.

## 3. Readiness Verdict

The existing `swarmproof_build_ready_spec.md` is strong enough to start execution. It already contains product scope, routes, data model, API contracts, worker architecture, personas, prompts, demo fixtures, acceptance tests, and parallel workstreams.

Additional implementation-readiness additions needed before overnight parallel execution:

1. Bootstrap the actual repository. This folder is currently not a Git repository and only contains the spec files. Codex app worktrees require Git.
2. Create the monorepo foundation before spawning write-heavy parallel workstreams.
3. Commit a stable baseline after foundation so cold sessions start from the same source.
4. Add `.worktreeinclude` if ignored files such as `.env.local` are needed inside Codex-managed worktrees.
5. Create clear merge gates so each workstream proves its slice before integration.
6. Keep a single source-of-truth brief in this file and keep `AGENTS.md` concise.

## 4. Recommended Codex Orchestration

Use `/goal`, not `/loop`, for overnight implementation. `/goal` is documented as persistent Goal mode. If it is not visible, enable it with:

```toml
[features]
goals = true
```

or run:

```bash
codex features enable goals
```

Use worktrees after Git is initialized. Use subagents mostly for read-heavy checks, design review, test triage, and merge review. Be careful with multiple write-heavy agents on overlapping files.

The best overnight shape is:

1. Local bootstrap/foundation goal.
2. Baseline commit.
3. Parallel worktree goals for independent slices.
4. Integration goal that merges, resolves conflicts, runs verification, and fills missing product gaps.
5. Release-readiness goal that deploys, validates public URL, checks Novus proof, and drafts submission assets.

## 5. Required Execution States

### State 0: Bootstrap Ready

Done when:

- Git repo exists.
- Package manager and workspace are initialized.
- Base app starts locally.
- `AGENTS.md`, this brief, and `swarmproof_build_ready_spec.md` are present.
- First commit exists so worktrees can branch from a clean baseline.

### State 1: Foundation Ready

Done when:

- Next.js App Router app exists.
- TypeScript, Tailwind, shadcn/ui or local UI primitives are configured.
- Shared packages exist for types, DB, events, AI provider wrapper, and test generation.
- Placeholder routes from the spec exist.
- Prisma or chosen DB schema is present.
- `pnpm lint`, `pnpm typecheck`, and `pnpm build` are available.

### State 2: Demo Path Ready

Done when:

- `/demo-target` flows exist and are visually credible.
- Intentional bugs exist: mobile hidden CTA, confusing invite CTA, duplicate project on double click, invalid email problem.
- The demo target is reachable without auth.

### State 3: Audit Backend Ready

Done when:

- Audit creation, preflight, run start, polling/events, report retrieval, share APIs exist.
- URL safety checker blocks private/internal hosts.
- Worker callbacks can create step and completion events.
- Mock/demo mode works without external browser provider credentials.

### State 4: Agent Execution Ready

Done when:

- Browser worker or in-app fallback can run at least normal, mobile, and chaos personas.
- Each persona emits step logs and screenshots or screenshot-equivalent demo artifacts.
- Fireworks provider wrapper exists, with deterministic fallback when `FIREWORKS_API_KEY` is missing.
- Console/network capture is implemented where possible.

### State 5: User Experience Ready

Done when:

- Landing page, new audit form, live run dashboard, report, replay, tests, share page, privacy page, and Novus proof page exist.
- Demo audit can be started from the landing page.
- Report includes issues, evidence, suggested fixes, and generated Playwright test.

### State 6: Analytics And Submission Ready

Done when:

- Novus install is wired or a clearly isolated placeholder wrapper is ready for real keys.
- Local `EventLog` mirrors required events.
- `/novus-proof` shows the funnel.
- Public deployment instructions are documented.
- Demo script and written submission draft exist.

### State 7: Release Verified

Done when:

- `pnpm lint`, `pnpm typecheck`, `pnpm test` if present, and `pnpm build` pass or documented blockers are real.
- Public deployed URL works.
- Demo audit completes in under 3 minutes or deterministic fallback completes reliably.
- Share link opens unauthenticated.
- Novus dashboard screenshot can be produced.

## 6. Workstream Ownership

Use these ownership boundaries to reduce merge conflicts:

- Foundation: root config, workspace, package setup, shared types, DB schema, event names, placeholder routes.
- Demo target: `apps/web/app/demo-target/**`, `apps/web/components/demo-target/**`.
- Backend/API: `apps/web/app/api/**`, DB access, URL safety, event logging.
- Browser worker: `apps/browser-worker/**`, agent loop, Playwright, callbacks.
- Live UI: `apps/web/app/audits/new/**`, `apps/web/app/audits/[auditId]/running/**`, progress components.
- Report/testgen: report, replay, tests, share page, `packages/testgen/**`, report prompt.
- Analytics/polish: event wrapper, `/novus-proof`, landing polish, demo script, submission copy.

Merge order:

1. foundation
2. demo target
3. backend/API
4. worker
5. live UI integration
6. report/testgen
7. analytics/polish
8. final release pass

## 7. Master `/goal` Prompt

Use this as the main overnight goal after the foundation baseline exists.

```text
/goal Build SwarmProof to hackathon-submission readiness using the local source of truth.

Context:
- Read AGENTS.md, swarmproof_codex_execution_brief.md, and swarmproof_build_ready_spec.md before editing.
- The product is SwarmProof: AI users test a product URL and goal before real users suffer.
- The hackathon is Mind the Product World Product Day 2026. Deadline: June 20, 2026 at 5:00 PM BST.
- Winning priorities are Product Thinking, Craft and Execution, Originality and Ambition, and Shippedness.
- The submission must have a public deployed URL, a 2-3 minute demo video, Novus installed with dashboard screenshot, and a short written description.

Mission:
Starting from the current repo state, implement the next highest-leverage work needed to make SwarmProof a real deployed product. Work in the required execution states from swarmproof_codex_execution_brief.md. Do not skip earlier states if registration, discovery, install, or activation is missing.

Required behavior:
1. First diagnose the current repo state and identify which execution state is incomplete.
2. Implement the missing pieces for that state.
3. Run the smallest relevant verification for the changed area.
4. Run broader checks when scripts exist: pnpm lint, pnpm typecheck, pnpm test, pnpm build.
5. If checks fail, fix relevant failures and rerun.
6. If a dependency, feature, command, route, or provider is unavailable, diagnose in layer order: registration/discovery/install/activation first, then permissions, then runtime.
7. Preserve unrelated changes. Do not reset or revert work you did not make.
8. Keep edits scoped to the workstream ownership boundaries unless integration requires crossing them.
9. After finishing a state, update documentation or implementation notes only if it helps the next cold session continue.
10. Continue to the next execution state if the current one is verified and there is remaining time/context.

Definition of done:
- A stranger can open the public app, start the built-in demo audit, watch personas run, see issues with evidence, open a generated report, view a generated Playwright test, and open a public share link.
- Required Novus event tracking is wired or clearly isolated behind a wrapper ready for real Novus credentials.
- The app has clear deployment instructions and submission materials.
- Final checks pass or every remaining blocker is concrete, minimal, and documented with the exact next command/action.
```

## 8. Cold Worktree Goal Prompts

Use these only after State 0 and State 1 have a clean baseline commit.

### Demo Target Goal

```text
/goal Implement the SwarmProof built-in demo target app.

Read AGENTS.md, swarmproof_codex_execution_brief.md, and swarmproof_build_ready_spec.md. Own only demo target files unless a tiny shared component is unavoidable. Build /demo-target with signup, onboarding/projects, project creation, and invite teammate flows. Include the intentional bugs from the spec. Verify locally with the smallest route smoke test available, then run lint/typecheck/build if available. Do not edit audit/report/backend/worker pages.
```

### Backend/API Goal

```text
/goal Implement SwarmProof audit backend APIs and persistence.

Read AGENTS.md, swarmproof_codex_execution_brief.md, and swarmproof_build_ready_spec.md. Own API routes, DB access, URL safety, event logging, and mock/demo run support. Implement audit creation, preflight, run start, event polling, worker callbacks, report retrieval, and share APIs. Diagnose missing registration/discovery/install before runtime. Verify URL safety, API contracts, and build checks.
```

### Worker Goal

```text
/goal Implement SwarmProof browser worker and agent runner.

Read AGENTS.md, swarmproof_codex_execution_brief.md, and swarmproof_build_ready_spec.md. Own browser-worker and directly related AI provider files. Implement provider abstraction, Playwright runner, persona loop, screenshot capture, console/network capture where possible, step callbacks, completion callbacks, and deterministic demo fallback when Fireworks or browser credentials are absent. Verify with demo target or a mocked callback server.
```

### Live UI Goal

```text
/goal Implement SwarmProof audit creation and live run UI.

Read AGENTS.md, swarmproof_codex_execution_brief.md, and swarmproof_build_ready_spec.md. Own /audits/new and /audits/[auditId]/running plus progress components. Build a polished form and live dashboard with persona cards, logs, screenshots, issue count, cancel/completion states, and polling integration. Use mock data only where APIs are absent, and switch to real endpoints when present. Verify responsive layout and build checks.
```

### Report/Testgen Goal

```text
/goal Implement SwarmProof report, replay, share, and generated test surfaces.

Read AGENTS.md, swarmproof_codex_execution_brief.md, and swarmproof_build_ready_spec.md. Own report, replay, tests, share pages, report prompt, and test generation package. Produce PM-readable report sections, screenshot timeline, generated Playwright test, markdown bug export, and unauthenticated share view. Verify with fixture/demo audit data and build checks.
```

### Analytics/Polish Goal

```text
/goal Wire SwarmProof analytics, Novus proof, landing polish, and submission assets.

Read AGENTS.md, swarmproof_codex_execution_brief.md, and swarmproof_build_ready_spec.md. Own event wrapper, event names, /novus-proof, landing polish, privacy copy, demo script, and submission draft. Ensure events avoid raw target content and sensitive data. Verify the event funnel locally and run build checks.
```

## 9. Integration Goal Prompt

Use this after parallel branches finish.

```text
/goal Integrate completed SwarmProof workstreams into a verified hackathon-ready product.

Read AGENTS.md, swarmproof_codex_execution_brief.md, and swarmproof_build_ready_spec.md. Inspect all branch/worktree diffs before merging. Merge in the documented order: foundation, demo target, backend/API, worker, live UI, report/testgen, analytics/polish. Resolve conflicts by preserving the implementation that best satisfies the spec and public demo path. After each merge, run targeted checks for affected areas. After all merges, run pnpm lint, pnpm typecheck, pnpm test if present, and pnpm build. Then execute the core smoke path: landing -> run demo audit -> running dashboard -> report -> generated test -> share page -> novus proof. Fix failures, rerun checks, and continue until release verified or a concrete blocker remains.
```

## 10. Release Goal Prompt

Use this for final deployment and submission prep.

```text
/goal Prepare SwarmProof for final Devpost submission.

Read AGENTS.md, swarmproof_codex_execution_brief.md, and swarmproof_build_ready_spec.md. Verify the public deployment path, required environment variables, Novus install, and demo audit. Produce or update docs for deployment, demo video script, Devpost written description, known limitations, and judging-rubric talking points. Run final checks. The product is complete only when the public URL can be used by a stranger without local setup.
```

## 11. Practical Notes

- Do not spend the first night on external URL perfection. Make the internal demo path excellent.
- Use deterministic fallback openly. It is better to show a reliable demo mode than a flaky hidden external automation dependency.
- Keep the product surface tight: URL/goal in, visible agents running, evidence/report/tests out.
- For judging, make "Novus installed and behavior measurable" visible in the product and demo.
- The highest-risk dependencies are browser execution deployment and Novus integration. Isolate both behind wrappers early.

## 12. Research Notes

Official Codex docs support the core orchestration choices:

- Goal mode is for persistent objectives with measurable completion criteria.
- Codex app slash commands list `/goal`; `/loop` is not documented as an app slash command.
- Worktrees are the right primitive for independent parallel code changes, but require a Git repository.
- AGENTS.md is the correct durable project instruction surface.
- Subagents are useful for parallel exploration, tests, triage, and summarization; write-heavy parallel agents need tighter boundaries.
- Automations can provide heartbeat-style follow-up loops, but they are not a substitute for a clear `/goal`.

Recent empirical and research guidance also supports staged gates:

- AI coding tool failures often arise from API, integration, configuration, terminal, and command-execution issues, so diagnose install/activation/configuration before runtime symptoms.
- Behavior-driven testing of agent workflows catches process-level deviations, not just final output failures.
- Staged workflows with explicit planning, correctness gates, and iterative refinement outperform vague zero-shot agent instructions in complex build work.
