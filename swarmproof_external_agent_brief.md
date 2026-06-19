# SwarmProof External Agent Upgrade Brief

Date: June 19, 2026

Use this as the source of truth for the next implementation session.

## Current State

SwarmProof is live at `https://swarm-proof-web.vercel.app/`.

The Vercel web app dispatches real browser runs to the Railway worker with `BROWSER_PROVIDER=local-playwright`. Supabase persistence is working through the `supabase-rest` adapter. The reliable `/demo-target` flow must remain intact.

## Live Finding That Triggered This Work

Chrome end-to-end test:

- Target: `https://www.apple.com/macbook-air/`
- Goal: `I want to buy a MacBook Air. Find the product path, understand pricing or configuration choices, and see whether starting purchase is easy without completing checkout.`

SwarmProof result:

- 3 personas ran.
- All loaded the Apple MacBook Air page.
- All stopped at step 1.
- Report incorrectly said `Audit reached an auth or verification wall`.
- Generated test incorrectly used demo words: `/project|people|invite|error/i`.

Manual browser check showed Apple is publicly navigable:

- MacBook Air page has visible `Buy MacBook Air`.
- Buy path shows pricing, 13/15-inch model choices, colors, chip, memory, and storage.
- The audit should explore this safe product/configuration path, then stop before cart, checkout, payment, login, or private data.

## Product Goal

Make external public URL audits feel like three AI user personas testing a real goal:

- normal: direct goal pursuit;
- mobile: small viewport, menu/touch/friction awareness;
- chaos: messy but safe, with no irreversible actions.

The product should produce useful evidence, truthful safety stops, PR-ready recommendations, and external-goal-specific generated tests.

## Required Guardrails

Do not enter credentials, payment data, personal data, or checkout forms.

Do not complete purchases, reservations, subscriptions, account changes, destructive actions, or real PR creation.

Allow safe exploration: `Buy`, `Shop`, `Compare`, `Customize`, `Choose`, `Select`, `Learn more`, same-origin product/configuration links.

Block commitment: `Add to Bag`, `Checkout`, `Place Order`, `Pay`, `Confirm`, `Subscribe`, `Book`, `Reserve`, `Delete`, `Logout`.

Never execute arbitrary model selectors or arbitrary model URLs. The model may only choose from validated candidate actions.

## Build Scope

1. Fix false auth-wall detection.
   - Do not scan whole-page text naively.
   - Require strong visible task-area signals: password field, CAPTCHA widget, verification code, access-denied/login-only panel.
   - Nav/footer words like `Sign in` must not block a public product page.

2. Improve external action policy.
   - Separate safe exploration from unsafe commitment.
   - Apple-like product shopping should navigate beyond landing into buy/configuration pages without adding to bag.

3. Add Fireworks-assisted action planning.
   - Use `packages/ai`.
   - If `FIREWORKS_API_KEY` exists, request strict JSON next-action planning.
   - Input: goal, persona, URL/title, candidate actions, history, safety policy.
   - Output: choose candidate action, observe, done, or fail.
   - Fallback to rule planner on absent/invalid/unsafe/slow AI.

4. Improve report and generated test quality.
   - Reports must distinguish product friction, safety stop, auth-limited stop, agent uncertainty, and technical failure.
   - Deduplicate repeated persona issues.
   - Add PR-ready recommendations: user impact, repro, likely area, suggested implementation, regression-test note.
   - External generated tests must use actual target evidence, not demo-target assertions.

5. Add light queue/retry/observability.
   - Track attempt count, last error, timestamps, provider, run mode, blocked/safety reason where practical.
   - Keep simple. Do not add Redis/Inngest unless trivial.

## Required Tests

- Apple-like page text with nav/footer sign-in does not trigger auth wall.
- Strong login/password/CAPTCHA content does trigger auth wall.
- Safe commerce exploration allows `Buy MacBook Air` or `Customize`.
- Unsafe commitment blocks `Add to Bag`, `Checkout`, `Place Order`, `Pay`.
- Invalid AI planner output falls back safely.
- External generated tests do not contain `project|people|invite|error`.
- `/demo-target` contracts still pass.

## Checkpoints

Checkpoint 1: Safety/auth tests pass before worker behavior changes.

Checkpoint 2: Planner validation tests pass before any model-selected action can execute.

Checkpoint 3: Report/testgen tests pass before UI changes.

Checkpoint 4: Full validation passes:

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

Checkpoint 5: Smoke:

- `/demo-target` still gives 3 personas, report, share, generated test.
- Apple external audit reaches at least the buy/configuration path or gives a truthful safety stop.
- No cart/checkout/payment/private-data action is taken.

## Finish Line

Apple-style public shopping flow is not falsely labeled auth-limited at step 1.

External audits perform 2-4 safe, goal-relevant steps when available.

Reports and tests are specific to the external target and goal.

Demo reliability is preserved.
