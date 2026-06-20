# SwarmProof Live Worker Slice

Date: June 19, 2026

This branch adds the first local browser execution path. The deterministic `/demo-target` fallback still works when no worker is configured.

## Local Commands

Install dependencies:

```bash
pnpm install
```

Install a Chromium browser for Playwright if it is not already present:

```bash
pnpm --filter @swarmproof/browser-worker exec playwright install chromium
```

Start the web app:

```bash
NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000 pnpm dev
```

Start the worker in another shell:

```bash
BROWSER_PROVIDER=local-playwright WORKER_CONCURRENCY=1 PORT=8787 pnpm worker:dev
```

Run the web app with dispatch enabled:

```bash
BROWSER_WORKER_URL=http://127.0.0.1:8787 BROWSER_PROVIDER=local-playwright NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000 pnpm dev
```

## Behavior

- `BROWSER_WORKER_URL` absent: `/api/audits/:id/run` uses the deterministic in-process runner.
- Worker healthy but not `local-playwright`: web falls back to deterministic mode.
- Worker `local-playwright`: web prepares running jobs, dispatches each persona, and stores callbacks.
- `WORKER_CONCURRENCY` defaults to `1` and is clamped between `1` and `3`. Keep Railway/Hobby deployments at `1` because each Playwright persona starts Chromium; use `2` or `3` only after upgrading worker memory.
- Web watchdogs use `SWARMPROOF_PERSONA_TIMEOUT_MS` while worker requests use a 10 second shorter timeout, giving the worker's terminal callback a chance to land before the web app creates a watchdog fallback report.
- Browser launch failure: worker posts a warning step and falls back to deterministic callbacks.

## Current Scope

The local Playwright provider supports:

- real browser runs on `/demo-target`;
- real screenshot evidence via callback artifacts;
- console and network failure counts;
- conservative public URL exploration with a bounded DOM-driven planner;
- goal-aware ranking for visible links, buttons, and safe search fields;
- same-origin navigation only, no credential fields, and no risky form submission unless explicitly owner-confirmed.

External URL mode is intentionally safety-limited. It does not support private authenticated apps, CAPTCHA bypass, payments, destructive actions, or arbitrary PR creation.
