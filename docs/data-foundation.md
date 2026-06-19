# SwarmProof Data Foundation

Date: June 19, 2026

This branch establishes the baseline data contracts needed before the real browser worker and live evidence UI land. The production runtime now includes a Postgres-backed audit snapshot adapter.

## Current Runtime Mode

The app still defaults to the memory/demo adapter when `DATABASE_URL` is absent. This is intentional so local tests and the deterministic `/demo-target` path work without a database.

When `DATABASE_URL` is present, `packages/db` stores audit snapshots in Postgres table `swarmproof_audit_snapshots`. The table is created automatically on first use and stores the normalized audit, runs, steps, events, artifacts, report, jobs, and share token as JSONB. Mutations take a per-audit Postgres advisory lock so worker callbacks do not overwrite each other.

`packages/db/prisma/schema.prisma` remains persistence-ready for a later normalized Prisma adapter covering:

- audits with normalized URLs, max steps, provider, preflight JSON, errors, and completion timestamps;
- agent runs with persona mode;
- browser steps with status and artifact references;
- artifacts with audit/run references, storage keys, content type, size, and metadata;
- audit jobs for future worker dispatch;
- reports, issues, events, and share tokens.

## Environment Variables

```bash
DATABASE_URL=
SWARMPROOF_PERSISTENCE=memory # optional local override
SWARM_DB_POOL_MAX=3 # optional
BROWSER_PROVIDER=demo|local-playwright|browserbase-stagehand
ARTIFACT_STORAGE_PROVIDER=memory|supabase|r2
SUPABASE_STORAGE_BUCKET=swarmproof
R2_BUCKET=
```

## Adapter Status

- Without `DATABASE_URL`: `getDatabaseStatus()` reports memory fallback.
- With `DATABASE_URL`: `getDatabaseStatus()` reports `activeAdapter: "postgres"` and `dbBacked: true`.
- Set `SWARMPROOF_PERSISTENCE=memory` only when you intentionally want to disable DB-backed mode.
- `getPersistenceConfig()` exposes the same mode information for later worker/UI sessions.
- `getArtifactStorageStatus()` reports memory/local fallback unless a storage provider env is configured.

## Production Direction

Use Supabase Postgres or Neon Postgres for `DATABASE_URL`.

Use Supabase Storage or Cloudflare R2 for screenshots, traces, console logs, and network logs. The current artifact boundary stores durable-shaped artifact references so the worker can later swap memory/data URLs for real object-storage URLs without changing report/replay contracts.
