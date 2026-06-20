# Persona Intelligence Build Brief

Date: June 20, 2026

## Current Product State

SwarmProof is deployed with a Vercel web app and Railway Playwright worker. The reliable built-in demo path exists, but the next product priority is live public URL audits. Railway Hobby memory is constrained, so keep `WORKER_CONCURRENCY=1` by default and do not require Browserbase.

The external URL flow already supports:

- public URL safety preflight;
- local Playwright browser worker;
- normal, mobile, and chaos modes;
- screenshot/evidence callbacks;
- safe same-origin navigation;
- blocked checkout/cart/payment/login/signup/contact-sales/book-demo actions;
- partial reports instead of hanging;
- optional Fireworks JSON planning when `FIREWORKS_API_KEY` is present.

The main gap is depth: personas are mostly labels plus small scoring differences. The next build should make external audits feel like distinct AI user testers with evidence-based reasoning and better reports.

## Mission

Build persona-intelligent external audits for public websites. A user should enter a public URL and goal, then see distinct persona behavior and a report explaining what each persona tried, why, what confused them, what evidence they found, and what product improvements follow.

## Non-Goals

- Do not replace Railway or add Browserbase.
- Do not implement authenticated/private-app testing.
- Do not bypass CAPTCHA, bot checks, paywalls, or sign-in.
- Do not click cart, checkout, payment, signup, login, start trial, contact sales, book demo, destructive, or private-data actions.
- Do not redesign the whole app.
- Do not implement automatic PR/code changes.
- Do not make the demo target the center of this work. Preserve it, but optimize live external audits.

## Target Public Test Scenarios

Use these as smoke scenarios, with safe-stop wording:

- Apple: "I want to compare MacBook Air options and understand which model fits me. Explore product/configuration info only. Stop before add to bag, checkout, payment, sign-in, or personal data."
- Vercel: "I want to understand pricing and how to deploy a Next.js app. Explore public pricing/docs/templates only. Stop before signup, login, start deploying, payment, contact sales, or private data."
- Supabase docs: "I want to find how to install Supabase in a Next.js app and understand pricing. Explore public docs/pricing only. Stop before login, signup, or private data."
- Stripe docs: "I want to find how to add payments to a web app. Explore public docs only. Stop before account creation, checkout, payment, or private data."

## Persona Requirements

Create richer persona profiles, likely in shared types and worker/planner code:

- normal/evaluator: practical first-time user, follows obvious information scent.
- mobile: narrow viewport, menu/tap-target sensitivity, less patient with dense pages.
- chaos/impatient: clicks plausible alternatives, backtracks, notices duplicate/confusing CTAs.
- technical: prefers docs/search/API/install links, understands technical terms.
- novice or accessibility-lite if already supported: avoids jargon, struggles with hidden menus and unclear labels.

Each persona should provide:

- name and mode;
- behavioral lens;
- goal interpretation;
- decision biases;
- likely mistakes/frictions;
- stop criteria.

Do not require adding every persona to the UI; at minimum make existing normal/mobile/chaos materially distinct.

## Planner Requirements

Improve the external planner so AI/fallback decisions carry structured reasoning:

- observation: what the visible page/candidates suggest;
- personaReasoning: why this persona would choose/avoid the action;
- expectedEvidence: what the persona expects to learn;
- stopReason when done/blocked/safe-stopped;
- confidence.

The AI planner must still choose only from provided candidate ordinals or return observe/done/fail. Deterministic fallback must remain safe when no Fireworks key is present.

Candidate collection should include enough safe context for reasoning:

- label, kind, href, sameOrigin, disabled, inputType;
- optional nearby text/section/heading if cheaply available;
- safe category hints such as docs/pricing/product/search/navigation/unsafe.

## Evidence Requirements

Each emitted step should be more human-readable:

- action;
- visible observation;
- persona thought/reason;
- result;
- whether evidence satisfies part of the goal;
- confusion/friction signal if applicable.

Do not store raw page content, secrets, credentials, screenshots in analytics events, or private URLs. Screenshots/artifacts can remain in artifact storage path, not event props.

## Report Requirements

Reports for external audits should synthesize across personas:

- overall result and limitations;
- per-persona story with intent, path, evidence, and stop reason;
- cross-persona comparison: where behaviors diverged;
- findings with severity, category, evidence steps, and suggested product fixes;
- safe-stop explanation when blocked by login/payment/cart/contact-sales;
- generated Playwright test based on observed external evidence, not demo assumptions.

If `FIREWORKS_API_KEY` is present, use AI report synthesis with strict fallback. Without the key, deterministic report synthesis must still improve over current output.

## UX Requirements

Keep UI changes scoped. Improve existing report/running views only as needed to show:

- persona reasoning;
- stop reason;
- goal evidence;
- differentiated persona stories.

Do not do a broad visual redesign.

## Validation

Run:

- focused worker/planner/report tests;
- `pnpm test`;
- `pnpm lint`;
- `pnpm typecheck`;
- `pnpm build`;
- `docker build -f Dockerfile.worker -t swarmproof-browser-worker:verify .`.

If Turbopack or Docker needs sandbox/network/port escalation, request it and rerun.

Manual smoke after deployment can be deferred to orchestrator, but local/API-level smoke should verify at least one external scenario produces differentiated persona evidence and a report.

## Finish Line

Done when:

- existing demo path still works;
- external public audits preserve safety constraints;
- normal/mobile/chaos produce meaningfully different reasoning/path summaries;
- reports explain persona behavior and actionable product recommendations;
- deterministic fallback works without `FIREWORKS_API_KEY`;
- tests cover persona profiles, planner safety, AI decision validation, and report synthesis;
- Railway memory constraints are respected with concurrency default `1`.
