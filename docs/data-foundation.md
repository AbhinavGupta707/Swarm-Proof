# SwarmProof Data Foundation

Date: June 19, 2026

This branch establishes the baseline data contracts needed before the real browser worker and live evidence UI land.

## Current Runtime Mode

The app still defaults to the memory/demo adapter when `DATABASE_URL` is absent. This is intentional so local tests and the deterministic `/demo-target` path work without a database.

`packages/db/prisma/schema.prisma` is now persistence-ready for:

- audits with normalized URLs, max steps, provider, preflight JSON, errors, and completion timestamps;
- agent runs with persona mode;
- browser steps with status and artifact references;
- artifacts with audit/run references, storage keys, content type, size, and metadata;
- audit jobs for future worker dispatch;
- reports, issues, events, and share tokens.

## Environment Variables

```bash
DATABASE_URL=
BROWSER_PROVIDER=demo|local-playwright|browserbase-stagehand
ARTIFACT_STORAGE_PROVIDER=memory|supabase|r2
SUPABASE_STORAGE_BUCKET=swarmproof
R2_BUCKET=
```

## Adapter Status

- Without `DATABASE_URL`: `getDatabaseStatus()` reports memory fallback with a Prisma-ready schema boundary.
- With `DATABASE_URL`: this branch reports that DB-backed mode is configured but still uses the memory fallback until the Prisma repository implementation is enabled.
- `getPersistenceConfig()` exposes the same mode information for later worker/UI sessions.
- `getArtifactStorageStatus()` reports memory/local fallback unless a storage provider env is configured.

## Production Direction

Use Supabase Postgres or Neon Postgres for `DATABASE_URL`.

Use Supabase Storage or Cloudflare R2 for screenshots, traces, console logs, and network logs. The current artifact boundary stores durable-shaped artifact references so the worker can later swap memory/data URLs for real object-storage URLs without changing report/replay contracts.

