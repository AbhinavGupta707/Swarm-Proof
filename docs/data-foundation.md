# SwarmProof Data Foundation

Date: June 19, 2026

This branch establishes the baseline data contracts needed before the real browser worker and live evidence UI land. The production runtime now includes durable audit snapshot adapters for direct Postgres and Supabase REST.

## Current Runtime Mode

The app still defaults to the memory/demo adapter when `DATABASE_URL` is absent. This is intentional so local tests and the deterministic `/demo-target` path work without a database.

When `DATABASE_URL` is present, `packages/db` stores audit snapshots in Postgres table `swarmproof_audit_snapshots`. The table is created automatically on first direct-Postgres use and stores the normalized audit, runs, steps, events, artifacts, report, jobs, and share token as JSONB.

Durable production should use the direct Postgres adapter by default. On serverless hosts, use Supabase's pooled Postgres connection string in `DATABASE_URL` and set `SWARMPROOF_PERSISTENCE=postgres` for clarity. The Supabase REST adapter is now opt-in only with `SWARMPROOF_PERSISTENCE=supabase-rest`; keep it as an emergency fallback, not the default write path, because live audits update one growing snapshot document many times.

The table bootstrap SQL is checked in at `packages/db/sql/swarmproof_audit_snapshots.sql` for Supabase SQL editor or future migration tooling. If an older database has the broad `swarmproof_audit_snapshots_data_gin_idx` index, run `packages/db/sql/2026-06-20-drop-snapshot-jsonb-gin-index.sql` once to remove it.

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
SWARMPROOF_SUPABASE_REST_TIMEOUT_MS=12000 # optional, REST fallback only
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
- With `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`: `getDatabaseStatus()` still reports `activeAdapter: "postgres"` unless `SWARMPROOF_PERSISTENCE=supabase-rest` is explicitly set.
- Set `SWARMPROOF_PERSISTENCE=memory` only when you intentionally want to disable DB-backed mode.
- Set `SWARMPROOF_PERSISTENCE=postgres` for production live audits.
- Set `SWARMPROOF_PERSISTENCE=supabase-rest` only as a short-term fallback when direct Postgres connectivity is unavailable.
- `getPersistenceConfig()` exposes the same mode information for later worker/UI sessions.
- `getArtifactStorageStatus()` reports memory/local fallback unless a storage provider env is configured.

## Production Direction

Use Supabase Postgres or Neon Postgres for `DATABASE_URL`. On Vercel with Supabase, prefer the Supabase transaction pooler connection string for serverless traffic. Keep `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` configured for Supabase Storage/API needs, but they no longer switch core audit persistence to REST.

Use Supabase Storage or Cloudflare R2 for screenshots, traces, console logs, and network logs. The current artifact boundary stores durable-shaped artifact references so the worker can later swap memory/data URLs for real object-storage URLs without changing report/replay contracts.
