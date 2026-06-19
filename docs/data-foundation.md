# SwarmProof Data Foundation

Date: June 19, 2026

This branch establishes the baseline data contracts needed before the real browser worker and live evidence UI land. The production runtime now includes durable audit snapshot adapters for direct Postgres and Supabase REST.

## Current Runtime Mode

The app still defaults to the memory/demo adapter when `DATABASE_URL` is absent. This is intentional so local tests and the deterministic `/demo-target` path work without a database.

When `DATABASE_URL` is present, `packages/db` stores audit snapshots in Postgres table `swarmproof_audit_snapshots`. The table is created automatically on first direct-Postgres use and stores the normalized audit, runs, steps, events, artifacts, report, jobs, and share token as JSONB.

If Supabase service credentials are also present, serverless production uses the Supabase REST adapter by default. This writes to the same table over HTTPS, which avoids raw Postgres socket/DNS issues on platforms like Vercel. REST mutations use timestamp-checked optimistic retries so concurrent worker callbacks reload and reapply their operation instead of silently overwriting each other. Direct Postgres can still be forced with `SWARMPROOF_PERSISTENCE=postgres`; local/test memory fallback can be forced with `SWARMPROOF_PERSISTENCE=memory`.

The table bootstrap SQL is checked in at `packages/db/sql/swarmproof_audit_snapshots.sql` for Supabase SQL editor or future migration tooling.

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
SWARMPROOF_PERSISTENCE=memory|postgres|supabase-rest # optional override
SWARM_DB_POOL_MAX=3 # optional
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_URL= # optional server-only alias
SUPABASE_SERVICE_ROLE_KEY=
BROWSER_PROVIDER=demo|local-playwright|browserbase-stagehand
ARTIFACT_STORAGE_PROVIDER=memory|supabase|r2
SUPABASE_STORAGE_BUCKET=swarmproof
R2_BUCKET=
```

## Adapter Status

- Without `DATABASE_URL`: `getDatabaseStatus()` reports memory fallback.
- With `DATABASE_URL`: `getDatabaseStatus()` reports `activeAdapter: "postgres"` and `dbBacked: true`.
- With `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`: `getDatabaseStatus()` reports `activeAdapter: "supabase-rest"` and `dbBacked: true`.
- Set `SWARMPROOF_PERSISTENCE=memory` only when you intentionally want to disable DB-backed mode.
- Set `SWARMPROOF_PERSISTENCE=postgres` only when direct Postgres sockets are known to work in the runtime.
- `getPersistenceConfig()` exposes the same mode information for later worker/UI sessions.
- `getArtifactStorageStatus()` reports memory/local fallback unless a storage provider env is configured.

## Production Direction

Use Supabase Postgres or Neon Postgres for `DATABASE_URL`. On Vercel with Supabase, keep `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` configured so the app can use the REST adapter.

Use Supabase Storage or Cloudflare R2 for screenshots, traces, console logs, and network logs. The current artifact boundary stores durable-shaped artifact references so the worker can later swap memory/data URLs for real object-storage URLs without changing report/replay contracts.
