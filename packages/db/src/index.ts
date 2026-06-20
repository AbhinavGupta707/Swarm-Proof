import { defaultPersonas, personaProfileForMode, type PersonaConfig, type PersonaMode } from "@swarmproof/types";
import { createAiProvider, reportSystemPrompt } from "@swarmproof/ai";
import { buildEvidencePlaywrightTest } from "@swarmproof/testgen";
import { Pool, type PoolClient } from "pg";
import type {
  ArtifactKind,
  ArtifactSummary,
  AuditJobSummary,
  AuditProvider,
  AuditEventSummary,
  AuditIssueSummary,
  AuditPreflightSummary,
  AuditReportSummary,
  AuditRunSummary,
  AuditStatus,
  AuditSummary,
  BrowserStepSummary,
  RunStatus
} from "@swarmproof/types";
import type { WorkerCompleteCallback, WorkerRunAgentRequest, WorkerStepCallback } from "@swarmproof/types";
export { assertDatabaseConfigured, getPersistenceConfig } from "./client";

type SafeProps = Record<string, string | number | boolean | null>;

type PreflightResult = AuditPreflightSummary;
type AuditOutcomeValue = AuditReportSummary["outcome"];
type StepEvidence = { run: AuditRunSummary; step: BrowserStepSummary };
type EvidenceStats = {
  runCount: number;
  completedRunCount: number;
  succeededRunCount: number;
  failedRunCount: number;
  blockedRunCount: number;
  timedOutRunCount: number;
  stepCount: number;
  issueCount: number;
  artifactCount: number;
  screenshotCount: number;
  warningStepCount: number;
  failedStepCount: number;
  topIssue?: AuditIssueSummary;
};
type AiReportDraft = {
  summary?: string;
  markdown?: string;
  generatedTest?: string;
};

type AuditRecord = Omit<AuditSummary, "score" | "runs" | "issues" | "generatedTest" | "report" | "artifacts" | "jobs" | "preflight"> & {
  modes: PersonaMode[];
  maxSteps: number;
  provider: AuditProvider;
  preflight: PreflightResult;
  runs: AuditRunSummary[];
  issues: AuditIssueSummary[];
  artifacts: ArtifactSummary[];
  jobs: AuditJobSummary[];
  report?: AuditReportSummary;
};

type Store = {
  audits: Map<string, AuditRecord>;
  events: AuditEventSummary[];
  artifacts: Map<string, ArtifactSummary>;
  jobs: Map<string, AuditJobSummary>;
};

type AuditSnapshot = {
  version: 1;
  audit: AuditRecord;
  events: AuditEventSummary[];
  savedAt: string;
};
type PersistedSnapshot = { snapshot?: AuditSnapshot; updatedAt?: string | null };
type PersistenceBackend = "memory" | "postgres" | "supabase-rest";
type SupabaseRestConfig = { url: string; serviceRoleKey: string };
type SupabaseRestInit = { method?: string; headers?: Record<string, string>; body?: string };

declare global {
  var __swarmproofStore: Store | undefined;
  var __swarmproofPgPool: Pool | undefined;
  var __swarmproofPgReady: Promise<void> | undefined;
}

const UNSAFE_EVENT_KEYS = ["url", "content", "screenshot", "secret", "token", "password", "email", "credential"];
const FINAL_RUN_STATUSES: RunStatus[] = ["SUCCEEDED", "FAILED", "BLOCKED", "TIMED_OUT"];
const SUPABASE_REST_MUTATION_RETRIES = 5;
const DEFAULT_PERSONA_TIMEOUT_MS = 75_000;
const DEFAULT_AUDIT_TIMEOUT_MS = 210_000;
const EVENTS_RESPONSE_LIMIT = 100;
const RUN_STEP_RESPONSE_LIMIT = 10;

export function getDatabaseStatus() {
  const activeAdapter = getPersistenceBackend();
  const dbBacked = activeAdapter !== "memory";
  return {
    configured: Boolean(process.env.DATABASE_URL),
    provider: getActiveProvider(),
    activeAdapter,
    dbBacked,
    prismaReady: true,
    note: activeAdapter === "postgres"
      ? "DATABASE_URL is configured; using the Postgres audit snapshot adapter with memory fallback for local tests."
      : activeAdapter === "supabase-rest"
        ? "DATABASE_URL and Supabase service credentials are configured; using the Supabase REST audit snapshot adapter."
      : "DATABASE_URL is absent; using deterministic memory fallback."
  };
}

export function getStore(): Store {
  if (!globalThis.__swarmproofStore) {
    globalThis.__swarmproofStore = { audits: new Map(), events: [], artifacts: new Map(), jobs: new Map() };
  }

  globalThis.__swarmproofStore.artifacts ??= new Map();
  globalThis.__swarmproofStore.jobs ??= new Map();

  return globalThis.__swarmproofStore;
}

export function resetMemoryStoreForTests() {
  globalThis.__swarmproofStore = { audits: new Map(), events: [], artifacts: new Map(), jobs: new Map() };
}

export function getArtifactStorageStatus() {
  return {
    provider: process.env.ARTIFACT_STORAGE_PROVIDER ?? "memory",
    bucket: process.env.SUPABASE_STORAGE_BUCKET ?? process.env.R2_BUCKET ?? null,
    durable: Boolean(process.env.ARTIFACT_STORAGE_PROVIDER && process.env.ARTIFACT_STORAGE_PROVIDER !== "memory"),
    localFallback: true
  };
}

export function getAuditArtifacts(auditId: string) {
  return requireAudit(auditId).artifacts;
}

export async function createAuditAsync(input: {
  targetUrl: string;
  goal: string;
  modes?: string[];
  maxSteps?: number;
  baseUrl: string;
}) {
  const result = createAudit(input);
  if (result.ok) {
    await saveAuditSnapshot(result.audit.id);
  }
  return result;
}

export async function runPreflightAsync(auditId: string) {
  return mutatePersistedAudit(auditId, () => runPreflight(auditId));
}

export async function startAuditRunAsync(auditId: string) {
  return mutatePersistedAudit(auditId, () => startAuditRun(auditId));
}

export async function startWorkerAuditRunAsync(auditId: string, callbackBaseUrl: string) {
  return mutatePersistedAudit(auditId, () => startWorkerAuditRun(auditId, callbackBaseUrl));
}

export async function blockWorkerAuditRunAsync(auditId: string, reason: string) {
  return mutatePersistedAudit(auditId, () => blockWorkerAuditRun(auditId, reason));
}

export async function getAuditOverviewAsync(auditId: string) {
  return readAuditWithWatchdog(auditId, () => getAuditOverview(auditId));
}

export async function getAuditEventsAsync(auditId: string) {
  return readAuditWithWatchdog(auditId, () => getAuditEvents(auditId));
}

export async function generateAuditReportAsync(auditId: string) {
  return mutatePersistedAudit(auditId, () => generateAuditReport(auditId));
}

export async function finalizeTimedOutAuditAsync(auditId: string, options: TimeoutFinalizationOptions = {}) {
  return mutatePersistedAudit(auditId, () => finalizeTimedOutAudit(auditId, options));
}

export async function createShareAsync(auditId: string, baseUrl: string) {
  return mutatePersistedAudit(auditId, () => createShare(auditId, baseUrl));
}

export async function getSharedReportAsync(shareToken: string) {
  if (!shouldUseDurablePersistence()) {
    return getSharedReport(shareToken);
  }

  const snapshot = await readSnapshotByShareToken(shareToken);
  if (snapshot) {
    restoreSnapshot(snapshot);
    return toSummary(snapshot.audit);
  }

  return shareToken === "demo-share" ? getSharedReport(shareToken) : undefined;
}

export async function recordWorkerStepAsync(input: WorkerStepCallback) {
  const auditId = input.auditId ?? await findPersistedAuditIdForRun(input.runId);
  return mutatePersistedAudit(auditId, () => recordWorkerStep(input));
}

export async function completeWorkerRunAsync(input: WorkerCompleteCallback) {
  const auditId = input.auditId ?? await findPersistedAuditIdForRun(input.runId);
  return mutatePersistedAudit(auditId, () => completeWorkerRun(input));
}

type TimeoutFinalizationOptions = {
  now?: Date | string;
  personaTimeoutMs?: number;
  auditTimeoutMs?: number;
};

async function readPersistedAudit<T>(auditId: string, operation: () => T): Promise<T> {
  if (!shouldUseDurablePersistence()) {
    return operation();
  }

  const snapshot = await readSnapshotByAuditId(auditId);
  if (!snapshot) {
    throw new Error("Audit not found.");
  }

  restoreSnapshot(snapshot);
  return operation();
}

async function mutatePersistedAudit<T>(auditId: string, operation: () => T): Promise<T> {
  const backend = getPersistenceBackend();
  if (backend === "memory") {
    return operation();
  }

  if (backend === "supabase-rest") {
    return mutateSupabaseSnapshot(auditId, operation);
  }

  await ensurePostgresPersistence();
  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [auditId]);

    const snapshot = await readSnapshotByAuditId(auditId, client);
    if (!snapshot) {
      throw new Error("Audit not found.");
    }
    restoreSnapshot(snapshot);

    const result = operation();
    await writeSnapshotToPostgres(client, auditId);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function readAuditWithWatchdog<T>(auditId: string, operation: () => T): Promise<T> {
  const backend = getPersistenceBackend();
  if (backend === "memory") {
    return operation();
  }

  if (backend === "supabase-rest") {
    for (let attempt = 0; attempt < SUPABASE_REST_MUTATION_RETRIES; attempt += 1) {
      const persisted = await readSupabaseSnapshotByAuditId(auditId);
      if (!persisted.snapshot) {
        throw new Error("Audit not found.");
      }

      restoreSnapshot(persisted.snapshot);
      const changed = finalizeTimedOutAuditRecord(requireAudit(auditId));
      if (changed) {
        generateAuditReport(auditId);
      }
      const result = operation();
      if (!changed) {
        return result;
      }

      const saved = await patchSupabaseSnapshot(auditId, persisted.updatedAt);
      if (saved) {
        return result;
      }

      await delay(30 * (attempt + 1));
    }

    throw new Error("Audit update conflicted too many times. Please retry the audit action.");
  }

  await ensurePostgresPersistence();
  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [auditId]);

    const snapshot = await readSnapshotByAuditId(auditId, client);
    if (!snapshot) {
      throw new Error("Audit not found.");
    }
    restoreSnapshot(snapshot);

    const changed = finalizeTimedOutAuditRecord(requireAudit(auditId));
    if (changed) {
      generateAuditReport(auditId);
    }
    const result = operation();
    if (changed) {
      await writeSnapshotToPostgres(client, auditId);
    }
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function saveAuditSnapshot(auditId: string) {
  const backend = getPersistenceBackend();
  if (backend === "memory") {
    return;
  }

  if (backend === "supabase-rest") {
    await writeSnapshot(auditId);
    return;
  }

  await ensurePostgresPersistence();
  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [auditId]);
    await writeSnapshotToPostgres(client, auditId);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function readSnapshotByAuditId(auditId: string, client?: PoolClient): Promise<AuditSnapshot | undefined> {
  const backend = getPersistenceBackend();
  if (backend === "memory") {
    return undefined;
  }

  if (backend === "supabase-rest") {
    return (await readSupabaseSnapshotByAuditId(auditId)).snapshot;
  }

  await ensurePostgresPersistence();
  const runner = client ?? getPostgresPool();
  const result = await runner.query<{ data: AuditSnapshot | string }>(
    "SELECT data FROM swarmproof_audit_snapshots WHERE id = $1 LIMIT 1",
    [auditId]
  );
  return parseSnapshot(result.rows[0]?.data);
}

async function mutateSupabaseSnapshot<T>(auditId: string, operation: () => T): Promise<T> {
  for (let attempt = 0; attempt < SUPABASE_REST_MUTATION_RETRIES; attempt += 1) {
    const persisted = await readSupabaseSnapshotByAuditId(auditId);
    if (!persisted.snapshot) {
      throw new Error("Audit not found.");
    }

    restoreSnapshot(persisted.snapshot);
    const result = operation();
    const saved = await patchSupabaseSnapshot(auditId, persisted.updatedAt);
    if (saved) {
      return result;
    }

    await delay(30 * (attempt + 1));
  }

  throw new Error("Audit update conflicted too many times. Please retry the audit action.");
}

async function readSupabaseSnapshotByAuditId(auditId: string): Promise<PersistedSnapshot> {
  const rows = await supabaseRest<Array<{ data: AuditSnapshot | string; updated_at: string | null }>>(
    `/swarmproof_audit_snapshots?id=eq.${encodeURIComponent(auditId)}&select=data,updated_at&limit=1`
  );
  const row = rows[0];
  return {
    snapshot: parseSnapshot(row?.data),
    updatedAt: row?.updated_at ?? null
  };
}

async function patchSupabaseSnapshot(auditId: string, expectedUpdatedAt?: string | null) {
  const { audit, snapshot } = buildSnapshot(auditId);
  const updatedAtFilter = expectedUpdatedAt ? `&updated_at=eq.${encodeURIComponent(expectedUpdatedAt)}` : "";
  const rows = await supabaseRest<Array<{ id: string }>>(
    `/swarmproof_audit_snapshots?id=eq.${encodeURIComponent(auditId)}${updatedAtFilter}&select=id`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        share_token: audit.shareToken ?? null,
        data: snapshot,
        updated_at: new Date().toISOString()
      })
    }
  );

  return rows.length === 1;
}

async function readSnapshotByShareToken(shareToken: string): Promise<AuditSnapshot | undefined> {
  if (getPersistenceBackend() === "supabase-rest") {
    const rows = await supabaseRest<Array<{ data: AuditSnapshot | string }>>(
      `/swarmproof_audit_snapshots?share_token=eq.${encodeURIComponent(shareToken)}&select=data&limit=1`
    );
    return parseSnapshot(rows[0]?.data);
  }

  await ensurePostgresPersistence();
  const result = await getPostgresPool().query<{ data: AuditSnapshot | string }>(
    "SELECT data FROM swarmproof_audit_snapshots WHERE share_token = $1 LIMIT 1",
    [shareToken]
  );
  return parseSnapshot(result.rows[0]?.data);
}

async function findPersistedAuditIdForRun(runId: string): Promise<string> {
  const backend = getPersistenceBackend();
  if (backend === "memory") {
    const match = [...getStore().audits.values()].find((audit) => audit.runs.some((run) => run.id === runId));
    if (!match) throw new Error("Run not found.");
    return match.id;
  }

  if (backend === "supabase-rest") {
    const rows = await supabaseRest<Array<{ id: string; data: AuditSnapshot | string }>>(
      "/swarmproof_audit_snapshots?select=id,data&order=updated_at.desc&limit=50"
    );
    const match = rows.find((row) => parseSnapshot(row.data)?.audit.runs.some((run) => run.id === runId));
    if (!match) {
      throw new Error("Run not found.");
    }
    return match.id;
  }

  await ensurePostgresPersistence();
  const result = await getPostgresPool().query<{ id: string }>(
    "SELECT id FROM swarmproof_audit_snapshots WHERE (data->'audit'->'runs') @> $1::jsonb LIMIT 1",
    [JSON.stringify([{ id: runId }])]
  );
  const auditId = result.rows[0]?.id;
  if (!auditId) {
    throw new Error("Run not found.");
  }
  return auditId;
}

async function writeSnapshot(auditId: string) {
  if (getPersistenceBackend() === "postgres") {
    const client = await getPostgresPool().connect();
    try {
      await writeSnapshotToPostgres(client, auditId);
      return;
    } finally {
      client.release();
    }
  }

  const { audit, snapshot } = buildSnapshot(auditId);
  await supabaseRest("/swarmproof_audit_snapshots?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      id: audit.id,
      share_token: audit.shareToken ?? null,
      data: snapshot,
      updated_at: new Date().toISOString()
    })
  });
}

async function writeSnapshotToPostgres(client: PoolClient, auditId: string) {
  const { audit, snapshot } = buildSnapshot(auditId);
  await client.query(
    `INSERT INTO swarmproof_audit_snapshots (id, share_token, data, updated_at)
     VALUES ($1, $2, $3::jsonb, now())
     ON CONFLICT (id) DO UPDATE SET
       share_token = EXCLUDED.share_token,
       data = EXCLUDED.data,
       updated_at = now()`,
    [audit.id, audit.shareToken ?? null, JSON.stringify(snapshot)]
  );
}

function buildSnapshot(auditId: string) {
  const audit = getStore().audits.get(auditId);
  if (!audit) {
    throw new Error("Audit not found.");
  }

  const snapshot: AuditSnapshot = {
    version: 1,
    audit,
    events: getStore().events.filter((event) => event.auditId === auditId),
    savedAt: new Date().toISOString()
  };

  return { audit, snapshot };
}

function parseSnapshot(value: AuditSnapshot | string | undefined): AuditSnapshot | undefined {
  if (!value) {
    return undefined;
  }
  return typeof value === "string" ? JSON.parse(value) as AuditSnapshot : value;
}

function restoreSnapshot(snapshot: AuditSnapshot) {
  const store = getStore();
  const audit = snapshot.audit;
  store.audits.set(audit.id, audit);
  store.events = store.events.filter((event) => event.auditId !== audit.id).concat(snapshot.events ?? []);

  for (const artifact of audit.artifacts ?? []) {
    store.artifacts.set(artifact.id, artifact);
  }
  for (const job of audit.jobs ?? []) {
    store.jobs.set(job.id, job);
  }
}

async function ensurePostgresPersistence() {
  if (!shouldUsePostgresPersistence()) {
    return;
  }

  globalThis.__swarmproofPgReady ??= (async () => {
    const pool = getPostgresPool();
    await pool.query(`
      CREATE TABLE IF NOT EXISTS swarmproof_audit_snapshots (
        id text PRIMARY KEY,
        share_token text UNIQUE,
        data jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await pool.query("CREATE INDEX IF NOT EXISTS swarmproof_audit_snapshots_share_token_idx ON swarmproof_audit_snapshots (share_token) WHERE share_token IS NOT NULL");
    await pool.query("CREATE INDEX IF NOT EXISTS swarmproof_audit_snapshots_data_gin_idx ON swarmproof_audit_snapshots USING gin (data)");
  })();

  await globalThis.__swarmproofPgReady;
}

function getPostgresPool() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for Postgres persistence.");
  }

  globalThis.__swarmproofPgPool ??= new Pool({
    connectionString: databaseUrl,
    max: Number(process.env.SWARM_DB_POOL_MAX ?? 3),
    ssl: shouldUseDatabaseSsl(databaseUrl) ? { rejectUnauthorized: false } : undefined
  });
  return globalThis.__swarmproofPgPool;
}

function shouldUsePostgresPersistence() {
  return getPersistenceBackend() === "postgres";
}

function shouldUseDurablePersistence() {
  return getPersistenceBackend() !== "memory";
}

function getPersistenceBackend(): PersistenceBackend {
  const override = process.env.SWARMPROOF_PERSISTENCE;
  if (override === "memory") {
    return "memory";
  }

  if (!process.env.DATABASE_URL) {
    return "memory";
  }

  if (override === "postgres" || override === "supabase-rest") {
    return override;
  }

  return getSupabaseRestConfig() ? "supabase-rest" : "postgres";
}

function getSupabaseRestConfig(): SupabaseRestConfig | undefined {
  const rawUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!rawUrl || !serviceRoleKey) {
    return undefined;
  }

  return { url: rawUrl.replace(/\/+$/, ""), serviceRoleKey };
}

async function supabaseRest<T>(path: string, init: SupabaseRestInit = {}): Promise<T> {
  const config = getSupabaseRestConfig();
  if (!config) {
    throw new Error("Supabase REST persistence requires NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL plus SUPABASE_SERVICE_ROLE_KEY.");
  }

  const response = await fetch(`${config.url}/rest/v1${path}`, {
    method: init.method ?? "GET",
    headers: {
      apikey: config.serviceRoleKey,
      authorization: `Bearer ${config.serviceRoleKey}`,
      "content-type": "application/json",
      ...init.headers
    },
    body: init.body,
    cache: "no-store"
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Supabase REST persistence failed with ${response.status}: ${message.slice(0, 300)}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldUseDatabaseSsl(databaseUrl: string) {
  if (/sslmode=disable/i.test(databaseUrl)) {
    return false;
  }

  try {
    const host = new URL(databaseUrl).hostname;
    return !["localhost", "127.0.0.1", "::1"].includes(host);
  } catch {
    return true;
  }
}

function getActiveProvider(): AuditProvider {
  const configured = process.env.BROWSER_PROVIDER;
  if (configured === "demo" || configured === "local-playwright" || configured === "browserbase-stagehand") {
    return configured;
  }

  if (process.env.BROWSER_WORKER_URL) {
    return "local-playwright";
  }

  return process.env.DATABASE_URL ? "prisma-ready" : "memory-demo-adapter";
}

export function preflightTargetUrl(targetUrl: string, baseUrl: string): PreflightResult {
  const rawTarget = targetUrl.trim();

  if (rawTarget.startsWith("/")) {
    const normalized = new URL(rawTarget, baseUrl);
    if (normalized.pathname.startsWith("/demo-target")) {
      return { loadable: true, normalizedUrl: normalized.toString(), isDemoTarget: true };
    }

    return {
      loadable: false,
      blockedReason: "Only the built-in /demo-target path can be submitted as a relative URL.",
      normalizedUrl: normalized.toString(),
      isDemoTarget: false
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawTarget);
  } catch {
    return {
      loadable: false,
      blockedReason: "Enter an absolute http(s) URL or use the built-in /demo-target.",
      normalizedUrl: rawTarget,
      isDemoTarget: false
    };
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return {
      loadable: false,
      blockedReason: "Only http and https URLs can be audited.",
      normalizedUrl: parsed.toString(),
      isDemoTarget: false
    };
  }

  const host = parsed.hostname.toLowerCase();
  const base = new URL(baseUrl);
  const isDemoTarget = host === base.hostname.toLowerCase() && parsed.pathname.startsWith("/demo-target");

  if (!isDemoTarget && isPrivateOrInternalHost(host)) {
    return {
      loadable: false,
      blockedReason: "Localhost, private network, metadata, and internal hostnames are blocked for safety.",
      normalizedUrl: parsed.toString(),
      isDemoTarget: false
    };
  }

  return { loadable: true, normalizedUrl: parsed.toString(), isDemoTarget };
}

export function createAudit(input: {
  targetUrl: string;
  goal: string;
  modes?: string[];
  maxSteps?: number;
  baseUrl: string;
}) {
  const preflight = preflightTargetUrl(input.targetUrl, input.baseUrl);
  if (!preflight.loadable) {
    return { ok: false as const, error: preflight.blockedReason ?? "Target URL is blocked.", preflight };
  }

  const now = new Date().toISOString();
  const modes = normalizeModes(input.modes);
  const audit: AuditRecord = {
    id: createId("audit"),
    createdAt: now,
    updatedAt: now,
    targetUrl: input.targetUrl.trim(),
    normalizedUrl: preflight.normalizedUrl,
    goal: input.goal.trim() || "Explore the product and identify the main user friction.",
    status: "CREATED",
    provider: getActiveProvider(),
    modes,
    maxSteps: Math.max(3, Math.min(Number(input.maxSteps ?? 15), 30)),
    preflight,
    runs: [],
    issues: [],
    artifacts: [],
    jobs: [],
    eventCount: 0
  };

  getStore().audits.set(audit.id, audit);
  appendEvent("audit_created", audit.id, { modeCount: modes.length, demoTarget: preflight.isDemoTarget });
  appendEvent("url_submitted", audit.id, { demoTarget: preflight.isDemoTarget, safeTarget: true });

  return { ok: true as const, audit };
}

export function runPreflight(auditId: string) {
  const audit = requireAudit(auditId);
  audit.status = audit.preflight.loadable ? "PREFLIGHT" : "FAILED";
  touch(audit);
  appendEvent("preflight_started", audit.id, { demoTarget: audit.preflight.isDemoTarget });
  appendEvent("preflight_completed", audit.id, {
    loadable: audit.preflight.loadable,
    demoTarget: audit.preflight.isDemoTarget,
    blocked: Boolean(audit.preflight.blockedReason)
  });
  return audit.preflight;
}

export function startAuditRun(auditId: string) {
  const audit = requireAudit(auditId);
  if (audit.runs.length > 0) {
    return audit.runs.map((run) => run.id);
  }

  audit.status = "RUNNING";
  audit.provider = audit.preflight.isDemoTarget ? "demo" : "memory-demo-adapter";
  touch(audit);

  const personas = audit.modes.map((mode) => personaForMode(mode));
  for (const persona of personas) {
    const run = createRun(audit, persona);
    audit.runs.push(run);
    createJob(audit, run.id);
    appendEvent("agent_run_started", audit.id, { persona: persona.mode, maxSteps: audit.maxSteps });
    runDeterministicPersona(audit, run, persona);
    finishJobForRun(audit, run);
  }

  completeAuditIfReady(audit);
  generateAuditReport(audit.id);

  return audit.runs.map((run) => run.id);
}

export function startWorkerAuditRun(auditId: string, callbackBaseUrl: string) {
  const audit = requireAudit(auditId);
  if (!audit.preflight.loadable) {
    throw new Error(audit.preflight.blockedReason ?? "Target preflight failed.");
  }

  if (audit.runs.length === 0) {
    audit.status = "RUNNING";
    audit.provider = "local-playwright";
    touch(audit);

    const personas = audit.modes.map((mode) => personaForMode(mode));
    for (const persona of personas) {
      const run = createRun(audit, persona);
      audit.runs.push(run);
      createJob(audit, run.id, "DISPATCHED");
      appendEvent("agent_run_started", audit.id, {
        persona: persona.mode,
        maxSteps: audit.maxSteps,
        provider: "local-playwright",
        worker: true
      });
    }
  }

  const requests = audit.runs
    .filter((run) => !FINAL_RUN_STATUSES.includes(run.status))
    .map((run): WorkerRunAgentRequest => ({
      auditId: audit.id,
      runId: run.id,
      targetUrl: audit.normalizedUrl ?? audit.targetUrl,
      goal: audit.goal,
      persona: personaForMode(run.mode as PersonaMode),
      maxSteps: audit.maxSteps,
      timeoutMs: workerPersonaTimeoutMs(),
      callbackBaseUrl,
      runMode: audit.preflight.isDemoTarget ? "demo-target" : "external-public",
      allowExternalFormSubmissions: audit.preflight.isDemoTarget
    }));

  return {
    runIds: audit.runs.map((run) => run.id),
    requests,
    provider: audit.provider
  };
}

export function blockWorkerAuditRun(auditId: string, reason: string) {
  const audit = requireAudit(auditId);

  for (const run of audit.runs) {
    if (FINAL_RUN_STATUSES.includes(run.status)) continue;
    run.status = "BLOCKED";
    run.success = false;
    run.summary = reason;
    run.finishedAt = new Date().toISOString();
    finishJobForRun(audit, run);
    appendEvent("persona_blocked", audit.id, {
      persona: run.mode,
      reason: "worker_dispatch_failed"
    });
  }

  if (audit.runs.length > 0 && audit.issues.length === 0) {
    addIssue(audit, {
      severity: "MEDIUM",
      category: "Execution setup",
      title: "Browser worker could not start",
      description: reason,
      suggestedFix: "Check BROWSER_WORKER_URL, worker health, and Playwright browser installation."
    });
  }

  completeAuditIfReady(audit);
  generateAuditReport(audit.id);
  return toSummary(audit);
}

export function getAudit(auditId: string) {
  return getStore().audits.get(auditId);
}

export function getAuditOverview(auditId: string) {
  const audit = requireAudit(auditId);
  if (finalizeTimedOutAuditRecord(audit)) {
    generateAuditReport(audit.id);
  }
  return toSummary(audit);
}

export function getAuditEvents(auditId: string) {
  const audit = requireAudit(auditId);
  if (finalizeTimedOutAuditRecord(audit)) {
    generateAuditReport(audit.id);
  }
  const runSteps = audit.runs.flatMap((run) => run.steps ?? []);
  const events = getStore().events.filter((event) => event.auditId === audit.id);
  const recentSteps = runSteps.slice(-EVENTS_RESPONSE_LIMIT);
  const recentEvents = events.slice(-EVENTS_RESPONSE_LIMIT);
  return {
    events: recentEvents,
    eventCount: events.length,
    steps: recentSteps,
    runs: audit.runs.map((run) => ({
      ...run,
      steps: (run.steps ?? []).slice(-RUN_STEP_RESPONSE_LIMIT),
      artifacts: (run.artifacts ?? []).slice(-RUN_STEP_RESPONSE_LIMIT)
    })),
    status: audit.status,
    issueCount: audit.issues.length,
    issues: audit.issues,
    artifacts: audit.artifacts.slice(-EVENTS_RESPONSE_LIMIT),
    jobs: audit.jobs,
    provider: audit.provider,
    maxSteps: audit.maxSteps,
    preflight: audit.preflight,
    completedAt: audit.completedAt,
    updatedAt: audit.updatedAt
  };
}

export function generateAuditReport(auditId: string) {
  const audit = requireAudit(auditId);
  finalizeTimedOutAuditRecord(audit);
  const generatedTest = buildGeneratedTest(audit);
  const hasPartialRun = audit.runs.some((run) => FINAL_RUN_STATUSES.includes(run.status) && run.status !== "SUCCEEDED");
  const hasUnfinishedRun = audit.runs.some((run) => !FINAL_RUN_STATUSES.includes(run.status));
  const outcome: AuditOutcomeValue = audit.issues.some((issue) => issue.severity === "HIGH" || issue.severity === "CRITICAL")
    ? "fail"
    : audit.issues.length > 0 || hasPartialRun || hasUnfinishedRun
      ? "partial"
      : "pass";
  const score = calculateScore(audit);
  const now = new Date().toISOString();
  const report: AuditReportSummary = {
    id: audit.report?.id ?? createId("report"),
    auditId: audit.id,
    summary: buildReportSummary(audit),
    score,
    outcome,
    markdown: buildMarkdownReport(audit, score, outcome, generatedTest),
    reportJson: {
      outcome,
      issues: audit.issues,
      playwrightTests: [{ name: "swarmproof generated smoke test", code: generatedTest }]
    },
    createdAt: audit.report?.createdAt ?? now
  };

  audit.report = report;
  audit.updatedAt = now;
  appendEvent("report_generated", audit.id, { score, outcome, issueCount: audit.issues.length });
  return report;
}

export async function generateAuditReportWithAi(auditId: string) {
  const audit = requireAudit(auditId);
  const fallback = generateAuditReport(auditId);

  if (!process.env.FIREWORKS_API_KEY) {
    return fallback;
  }

  const draft = await createAiProvider().generateJson<AiReportDraft>({
    system: reportSystemPrompt,
    prompt: buildAiReportPrompt(audit),
    fallback: {}
  });
  const safeDraft = sanitizeAiReportDraft(draft);
  if (!safeDraft.summary && !safeDraft.markdown && !safeDraft.generatedTest) {
    appendEvent("ai_report_synthesis_skipped", audit.id, { reason: "fallback" });
    return fallback;
  }

  const generatedTest = safeDraft.generatedTest ?? fallback.reportJson.playwrightTests[0]?.code ?? buildGeneratedTest(audit);
  const report: AuditReportSummary = {
    ...fallback,
    summary: safeDraft.summary ?? fallback.summary,
    markdown: safeDraft.markdown ?? fallback.markdown,
    reportJson: {
      ...fallback.reportJson,
      playwrightTests: [{ name: "swarmproof generated smoke test", code: generatedTest }]
    }
  };
  audit.report = report;
  touch(audit);
  appendEvent("ai_report_synthesis_completed", audit.id, { used: true });
  return report;
}

export function createShare(auditId: string, baseUrl: string) {
  const audit = requireAudit(auditId);
  if (!audit.report) {
    generateAuditReport(auditId);
  }

  audit.shareToken = audit.shareToken ?? createId("share");
  touch(audit);
  appendEvent("share_created", audit.id, { issueCount: audit.issues.length });

  return {
    shareToken: audit.shareToken,
    shareUrl: new URL(`/share/${audit.shareToken}`, baseUrl).toString()
  };
}

export function getSharedReport(shareToken: string) {
  for (const audit of getStore().audits.values()) {
    if (audit.shareToken === shareToken) {
      return toSummary(audit);
    }
  }

  if (shareToken === "demo-share") {
    const created = createAudit({
      targetUrl: "/demo-target",
      goal: "Sign up, create a project, invite a teammate.",
      modes: ["normal", "mobile", "chaos"],
      baseUrl: "https://swarmproof.local"
    });
    if (created.ok) {
      startAuditRun(created.audit.id);
      created.audit.shareToken = "demo-share";
      return toSummary(created.audit);
    }
  }

  return undefined;
}

export function appendEvent(name: string, auditId: string | undefined, props: Record<string, unknown> = {}) {
  const event: AuditEventSummary = {
    id: createId("event"),
    auditId,
    name,
    props: sanitizeEventProps(props),
    createdAt: new Date().toISOString()
  };

  const store = getStore();
  store.events.push(event);

  if (auditId) {
    const audit = store.audits.get(auditId);
    if (audit) {
      audit.eventCount = (audit.eventCount ?? 0) + 1;
      audit.updatedAt = event.createdAt;
    }
  }

  return event;
}

export function recordWorkerStep(input: WorkerStepCallback) {
  const { audit, run } = requireRun(input.runId);
  const existingStep = (run.steps ?? []).find((step) => step.stepIndex === input.stepIndex);
  if (existingStep) {
    markJobRunningForRun(audit, run);
    return existingStep;
  }

  if (FINAL_RUN_STATUSES.includes(run.status)) {
    return {
      id: `${run.id}:ignored:${input.stepIndex}`,
      runId: run.id,
      stepIndex: input.stepIndex,
      action: input.action,
      status: input.status ?? "warning",
      thought: input.thought,
      result: "Ignored late worker callback because this persona run is already finalized.",
      url: input.url,
      createdAt: new Date().toISOString()
    } satisfies BrowserStepSummary;
  }

  const screenshotUrl = input.screenshotUrl ?? (input.screenshotBase64 ? `data:image/png;base64,${input.screenshotBase64}` : undefined);
  const artifact = screenshotUrl
    ? createArtifact(audit, {
        runId: run.id,
        kind: "SCREENSHOT",
        url: screenshotUrl,
        contentType: screenshotUrl.startsWith("data:image/png") ? "image/png" : undefined,
        meta: { stepIndex: input.stepIndex, source: "worker-callback" }
      })
    : undefined;
  const step = addStep(run, {
    stepIndex: input.stepIndex,
    action: input.action,
    status: input.status ?? "passed",
    thought: input.thought,
    result: input.result,
    url: input.url,
    screenshotUrl,
    artifactId: input.artifactId ?? artifact?.id
  });
  run.startedAt = run.startedAt ?? new Date().toISOString();
  run.status = "RUNNING";
  markJobRunningForRun(audit, run);
  touch(audit);
  appendEvent("browser_step_completed", audit.id, { persona: run.mode, stepIndex: step.stepIndex });
  return step;
}

export function completeWorkerRun(input: WorkerCompleteCallback) {
  const { audit, run } = requireRun(input.runId);
  if (FINAL_RUN_STATUSES.includes(run.status)) {
    return toSummary(audit);
  }

  run.status = input.status ?? (input.success ? "SUCCEEDED" : "FAILED");
  run.success = input.success;
  run.summary = input.summary;
  run.startedAt = run.startedAt ?? new Date().toISOString();
  run.finishedAt = new Date().toISOString();

  for (const issue of input.issues ?? []) {
    addIssue(audit, {
      severity: issue.severity,
      category: issue.category,
      title: issue.title,
      description: issue.description,
      evidenceStepIds: issue.evidenceStepIds ?? [],
      suggestedFix: issue.suggestedFix,
      generatedTest: issue.generatedTest
    });
  }

  for (const artifact of input.artifacts ?? []) {
    createArtifact(audit, {
      runId: run.id,
      kind: normalizeArtifactKind(artifact.type),
      url: artifact.url,
      meta: artifact.meta
    });
  }

  appendEvent(eventNameForRunStatus(run.status), audit.id, {
    persona: run.mode,
    success: input.success,
    status: run.status,
    issueCount: input.issues?.length ?? 0
  });
  completeAuditIfReady(audit);
  finishJobForRun(audit, run);
  generateAuditReport(audit.id);
  return toSummary(audit);
}

function runDeterministicPersona(audit: AuditRecord, run: AuditRunSummary, persona: PersonaConfig) {
  run.status = "RUNNING";
  run.startedAt = new Date().toISOString();

  if (!audit.preflight.isDemoTarget) {
    addStep(run, {
      stepIndex: 1,
      action: "preflight_result",
      result: "Target passed safety checks, but no external browser worker is configured in this environment.",
      url: audit.normalizedUrl,
      screenshotUrl: fallbackFrame(persona.mode, "External run queued")
    });
    run.status = "BLOCKED";
    run.success = false;
    run.summary = "External URL support is safety-checked, but this demo build needs a browser worker credential or service to execute it.";
    run.finishedAt = new Date().toISOString();
    addIssue(audit, {
      severity: "MEDIUM",
      category: "Execution setup",
      title: "External browser execution is not configured",
      description: "The target URL passed safety checks, but this environment is using the deterministic fallback instead of a live browser worker.",
      evidenceStepIds: run.steps?.map((step) => step.id) ?? [],
      suggestedFix: "Set BROWSER_WORKER_URL or use the built-in demo target for the fully reliable hackathon path."
    });
    appendEvent("persona_blocked", audit.id, { persona: persona.mode, reason: "worker_unconfigured" });
    return;
  }

  const scripted = demoStepsForPersona(persona.mode);
  for (const scriptedStep of scripted.steps) {
    const step = addStep(run, {
      stepIndex: scriptedStep.stepIndex,
      action: scriptedStep.action,
      thought: scriptedStep.thought,
      result: scriptedStep.result,
      url: new URL(scriptedStep.path, audit.normalizedUrl).toString(),
      screenshotUrl: fallbackFrame(persona.mode, scriptedStep.result)
    });
    appendEvent("browser_step_completed", audit.id, { persona: persona.mode, stepIndex: step.stepIndex });
  }

  run.status = scripted.status;
  run.success = scripted.success;
  run.summary = scripted.summary;
  run.finishedAt = new Date().toISOString();

  for (const issue of scripted.issues) {
    addIssue(audit, {
      ...issue,
      evidenceStepIds: run.steps?.map((step) => step.id) ?? []
    });
  }

  appendEvent(scripted.success ? "run_completed" : "persona_blocked", audit.id, {
    persona: persona.mode,
    success: scripted.success
  });
}

function demoStepsForPersona(mode: PersonaMode) {
  if (mode === "mobile") {
    return {
      status: "FAILED" as RunStatus,
      success: false,
      summary: "Signup starts correctly, but the mobile modal hides the primary CTA below the visible viewport.",
      steps: [
        { stepIndex: 1, action: "goto", path: "/demo-target", thought: "Open the target.", result: "Demo landing page loaded." },
        { stepIndex: 2, action: "click_text", path: "/demo-target/signup", thought: "Start signup.", result: "Signup panel opened on a narrow viewport." },
        { stepIndex: 3, action: "inspect_viewport", path: "/demo-target/signup", thought: "Find the submit action.", result: "Create account CTA is below the fixed-height panel." }
      ],
      issues: [
        {
          severity: "HIGH" as const,
          category: "Mobile UX",
          title: "Signup CTA is hidden on mobile",
          description: "The fixed-height signup panel hides the submit action below the fold on small screens.",
          suggestedFix: "Let the modal content scroll or move the primary action into a sticky footer."
        }
      ]
    };
  }

  if (mode === "chaos") {
    return {
      status: "FAILED" as RunStatus,
      success: false,
      summary: "Double-clicking project creation creates duplicate project cards and leaves the user unsure which one is real.",
      steps: [
        { stepIndex: 1, action: "goto", path: "/demo-target/signup", thought: "Create an account quickly.", result: "Signup accepted demo credentials." },
        { stepIndex: 2, action: "double_click_text", path: "/demo-target/projects/new", thought: "Double click the primary action.", result: "Two Launch review projects appeared." },
        { stepIndex: 3, action: "fill_label", path: "/demo-target/invite", thought: "Try an invalid teammate email.", result: "Invalid email produced a vague error." }
      ],
      issues: [
        {
          severity: "MEDIUM" as const,
          category: "Form handling",
          title: "Double submit creates duplicate projects",
          description: "The create project button remains active while the request is pending.",
          suggestedFix: "Disable the submit button after first click and make creation idempotent."
        },
        {
          severity: "LOW" as const,
          category: "Validation",
          title: "Invite validation is vague",
          description: "Invalid teammate email input is accepted into the flow before a generic error appears.",
          suggestedFix: "Validate email format inline and explain exactly what needs to change."
        }
      ]
    };
  }

  return {
    status: "BLOCKED" as RunStatus,
    success: false,
    summary: "The flow reaches the invite area, but the teammate action is labeled Add people and is easy to miss.",
    steps: [
      { stepIndex: 1, action: "goto", path: "/demo-target", thought: "Begin the requested flow.", result: "Demo target opened." },
      { stepIndex: 2, action: "click_text", path: "/demo-target/projects/new", thought: "Create the first project.", result: "Project form accepted a Launch review project." },
      { stepIndex: 3, action: "find_invite", path: "/demo-target/invite", thought: "Look for invite teammate CTA.", result: "No explicit Invite teammate action is visible; Add people is ambiguous." }
    ],
    issues: [
      {
        severity: "MEDIUM" as const,
        category: "Information architecture",
        title: "Invite teammate CTA is hard to recognize",
        description: "The page uses Add people while the product goal and user expectation are to invite a teammate.",
        suggestedFix: "Rename the primary action to Invite teammate and keep People as the section label."
      }
    ]
  };
}

function createRun(audit: AuditRecord, persona: PersonaConfig): AuditRunSummary {
  return {
    id: createId("run"),
    persona: persona.name,
    mode: persona.mode,
    viewport: `${persona.viewport.width}x${persona.viewport.height}`,
    status: "PENDING",
    summary: "",
    steps: []
  };
}

function addStep(
  run: AuditRunSummary,
  input: Omit<BrowserStepSummary, "id" | "runId" | "createdAt">
): BrowserStepSummary {
  const step: BrowserStepSummary = {
    id: createId("step"),
    runId: run.id,
    createdAt: new Date().toISOString(),
    ...input
  };
  run.steps = [...(run.steps ?? []), step];
  return step;
}

function addIssue(audit: AuditRecord, issue: Omit<AuditIssueSummary, "id">) {
  const existing = audit.issues.find((candidate) => issueDedupeKey(candidate) === issueDedupeKey(issue));
  if (existing) {
    existing.severity = severityRank(issue.severity) > severityRank(existing.severity) ? issue.severity : existing.severity;
    existing.description = existing.description.length >= issue.description.length ? existing.description : issue.description;
    existing.evidenceStepIds = [...new Set([...(existing.evidenceStepIds ?? []), ...(issue.evidenceStepIds ?? [])])];
    existing.suggestedFix = existing.suggestedFix ?? issue.suggestedFix;
    existing.generatedTest = existing.generatedTest ?? issue.generatedTest;
    appendEvent("issue_deduped", audit.id, {
      severity: existing.severity,
      category: existing.category,
      issueCount: audit.issues.length
    });
    return existing;
  }

  const record: AuditIssueSummary = { id: createId("issue"), ...issue };
  audit.issues.push(record);
  appendEvent("issue_detected", audit.id, {
    severity: record.severity,
    category: record.category,
    issueCount: audit.issues.length
  });
  return record;
}

function buildReportSummary(audit: AuditRecord) {
  const stats = collectEvidenceStats(audit);

  if (stats.stepCount === 0) {
    return "SwarmProof has not collected browser evidence yet. Start an audit run to generate a report.";
  }

  if (!audit.preflight.isDemoTarget) {
    if (stats.timedOutRunCount > 0) {
      return `Partial report ready: ${pluralize(stats.timedOutRunCount, "persona")} timed out, but SwarmProof preserved ${pluralize(stats.stepCount, "evidence step")} and finalized the audit cleanly.`;
    }

    if (audit.issues.some((issue) => issue.category === "Execution setup")) {
      return `The target passed safety checks, but browser execution did not complete beyond ${pluralize(stats.stepCount, "evidence step")}.`;
    }

    const stopReason = externalStopReason(audit);
    if (stopReason) {
      return stopReason;
    }

    if (audit.provider === "local-playwright") {
      return `The local Playwright worker collected an evidence-backed trace with ${pluralize(stats.stepCount, "step")} across ${pluralize(stats.runCount, "persona")} and ${findingClause(stats)}.`;
    }

    return `The target passed safety checks and produced ${pluralize(stats.stepCount, "fallback evidence step")}, but external browser execution is not configured in this demo build.`;
  }

  return `SwarmProof collected an evidence-backed trace with ${pluralize(stats.stepCount, "step")} across ${pluralize(stats.runCount, "persona")} and ${findingClause(stats)}.`;
}

function buildMarkdownReport(audit: AuditRecord, score: number, outcome: AuditOutcomeValue, generatedTest: string) {
  const stats = collectEvidenceStats(audit);
  const personaSections = audit.runs.map((run) => formatRunEvidence(audit, run)).join("\n\n");
  const issueSections = audit.issues.map((issue, index) => formatIssueEvidence(audit, issue, index + 1)).join("\n\n");
  const artifactLines = audit.artifacts.map((artifact) => formatArtifactReference(audit, artifact)).join("\n");
  const bugExport = audit.issues.map((issue, index) => formatBugExport(audit, issue, index + 1)).join("\n\n");
  const comparison = formatPersonaComparison(audit);
  const limitations = formatReportLimitations(audit);
  const recommendations = formatProductRecommendations(audit);

  return `# SwarmProof audit report

Outcome: ${outcome}
Score: ${score}
Target: ${displayTarget(audit)}
Goal: ${audit.goal}
Provider: ${audit.provider}
Evidence: ${pluralize(stats.stepCount, "browser step")} across ${pluralize(stats.runCount, "persona")}; ${pluralize(stats.screenshotCount, "screenshot frame")}; ${pluralize(stats.artifactCount, "artifact")}.

${buildReportSummary(audit)}

## Persona comparison
${comparison}

## Persona results
${personaSections || "- No persona runs have been recorded yet."}

## Limitations
${limitations}

## Product recommendations
${recommendations}

## Reproduction evidence
${issueSections || "- No issues detected in this run."}

## Bug export
${bugExport || "- No bug export generated because no issues were detected."}

## Artifact references
${artifactLines || "- No artifact references were captured."}

## Generated Playwright starter

\`\`\`ts
${generatedTest}
\`\`\`
`;
}

function buildGeneratedTest(audit: AuditRecord) {
  const target = audit.preflight.isDemoTarget ? "/demo-target" : audit.normalizedUrl ?? audit.targetUrl;
  const issueProvidedTest = audit.issues.find((issue) => isUsableGeneratedTest(issue.generatedTest))?.generatedTest;
  if (issueProvidedTest) {
    return issueProvidedTest;
  }

  return buildEvidencePlaywrightTest({
    name: "swarmproof generated smoke test",
    targetUrl: target,
    goal: audit.goal,
    steps: collectStepEvidence(audit).map(({ step }) => ({
      stepIndex: step.stepIndex,
      action: step.action,
      result: step.result,
      thought: step.thought,
      url: step.url
    })),
    issues: audit.issues.map((issue) => ({
      title: issue.title,
      category: issue.category,
      severity: issue.severity
    }))
  });
}

function collectStepEvidence(audit: AuditRecord): StepEvidence[] {
  return audit.runs.flatMap((run) => (run.steps ?? []).map((step) => ({ run, step })));
}

function collectEvidenceStats(audit: AuditRecord): EvidenceStats {
  const stepEvidence = collectStepEvidence(audit);
  return {
    runCount: audit.runs.length,
    completedRunCount: audit.runs.filter((run) => FINAL_RUN_STATUSES.includes(run.status)).length,
    succeededRunCount: audit.runs.filter((run) => run.status === "SUCCEEDED").length,
    failedRunCount: audit.runs.filter((run) => run.status === "FAILED").length,
    blockedRunCount: audit.runs.filter((run) => run.status === "BLOCKED").length,
    timedOutRunCount: audit.runs.filter((run) => run.status === "TIMED_OUT").length,
    stepCount: stepEvidence.length,
    issueCount: audit.issues.length,
    artifactCount: audit.artifacts.length,
    screenshotCount: stepEvidence.filter(({ step }) => Boolean(step.artifactId || step.screenshotUrl)).length,
    warningStepCount: stepEvidence.filter(({ step }) => step.status === "warning").length,
    failedStepCount: stepEvidence.filter(({ step }) => step.status === "failed").length,
    topIssue: [...audit.issues].sort((left, right) => severityRank(right.severity) - severityRank(left.severity))[0]
  };
}

function findingClause(stats: EvidenceStats) {
  if (!stats.issueCount) {
    if (stats.timedOutRunCount > 0) {
      return `timed out for ${stats.timedOutRunCount} of ${stats.runCount || 0} personas but preserved partial evidence`;
    }
    return `did not find a blocking issue; ${stats.succeededRunCount} of ${stats.runCount || 0} personas completed cleanly`;
  }

  const topIssue = stats.topIssue ? `, led by "${stats.topIssue.title}"` : "";
  return `found ${pluralize(stats.issueCount, "issue")}${topIssue}`;
}

function externalStopReason(audit: AuditRecord) {
  const runHadBlocker = audit.runs.some((run) => run.status !== "SUCCEEDED");
  const issue = audit.issues.find((candidate) => candidate.category === "Auth-limited flow")
    ?? audit.issues.find((candidate) => candidate.category === "Safety stop")
    ?? audit.issues.find((candidate) => candidate.category === "Execution timeout")
    ?? audit.issues.find((candidate) => candidate.category === "Worker crash")
    ?? audit.issues.find((candidate) => candidate.category === "Agent uncertainty")
    ?? audit.issues.find((candidate) => ["Execution", "Execution setup"].includes(candidate.category))
    ?? audit.issues.find((candidate) => ["Console", "Network"].includes(candidate.category) && runHadBlocker)
    ?? audit.issues.find((candidate) => !["Console", "Network"].includes(candidate.category));
  if (!issue) {
    return undefined;
  }

  const stats = collectEvidenceStats(audit);
  if (issue.category === "Auth-limited flow") {
    return `Auth-limited stop: SwarmProof collected ${pluralize(stats.stepCount, "evidence step")} but found a strong login, password, CAPTCHA, or verification boundary before the goal could continue.`;
  }

  if (issue.category === "Safety stop") {
    return `Safety stop: SwarmProof safely explored ${pluralize(stats.stepCount, "evidence step")} and stopped before cart, checkout, payment, private data, or another irreversible commitment.`;
  }

  if (issue.category === "Execution timeout") {
    return `Partial report ready: SwarmProof timed out ${pluralize(stats.timedOutRunCount, "persona")} and preserved ${pluralize(stats.stepCount, "evidence step")} instead of leaving the audit running.`;
  }

  if (issue.category === "Worker crash") {
    return `Worker crash: SwarmProof preserved partial evidence and finalized the audit after the browser worker crashed or disconnected.`;
  }

  if (issue.category === "Agent uncertainty") {
    return `Agent uncertainty: SwarmProof loaded the public target but could not identify a safe, goal-relevant next step from the visible page evidence.`;
  }

  if (["Execution", "Execution setup", "Execution timeout", "Worker crash"].includes(issue.category) || (["Console", "Network"].includes(issue.category) && runHadBlocker)) {
    return `Technical failure: SwarmProof reached the target but browser execution, console, network, or worker setup issues limited the audit.`;
  }

  return `Product friction: SwarmProof collected ${pluralize(stats.stepCount, "evidence step")} and found goal-relevant friction, led by "${issue.title}".`;
}

function formatRunEvidence(audit: AuditRecord, run: AuditRunSummary) {
  const persona = personaProfileForMode(run.mode);
  const stopReason = stopReasonForRun(audit, run);
  const steps = (run.steps ?? []).slice(0, 8).map((step) => formatStepEvidence(audit, { run, step })).join("\n");
  return `### ${run.persona}
- Mode: ${run.mode}
- Viewport: ${run.viewport ?? "default"}
- Intent: ${safeLine(persona.goalInterpretation)}
- Lens: ${safeLine(persona.behavioralLens)}
- Decision bias: ${safeLine(persona.decisionBiases.slice(0, 2).join("; "))}
- Likely friction watched: ${safeLine(persona.likelyFrictions.slice(0, 2).join("; "))}
- Result: ${run.status} - ${safeLine(run.summary || "No run summary recorded.")}
- Stop reason: ${safeLine(stopReason)}
- Evidence:
${steps || "  - No steps recorded."}`;
}

function formatPersonaComparison(audit: AuditRecord) {
  if (audit.runs.length === 0) {
    return "- No persona runs have been recorded yet.";
  }

  const statusLine = audit.runs
    .map((run) => `${run.mode}: ${run.status}`)
    .join("; ");
  const divergentStatuses = new Set(audit.runs.map((run) => run.status)).size > 1;
  const issueCategories = [...new Set(audit.issues.map((issue) => issue.category))];
  const behaviorLines = audit.runs.map((run) => {
    const persona = personaProfileForMode(run.mode);
    const firstSignal = (run.steps ?? []).find((step) => step.thought || step.result);
    return `- ${run.persona}: ${safeLine(persona.behavioralLens, 150)} ${firstSignal ? `First signal: ${safeLine(firstSignal.thought ?? firstSignal.result, 150)}` : "No step signal captured."}`;
  }).join("\n");

  return `- Status spread: ${statusLine}.
- Divergence: ${divergentStatuses ? "Personas ended differently, which points to behavior-dependent friction rather than a single universal outcome." : "Personas ended with the same status, so the strongest signal is shared across behavior modes."}
- Issue categories compared: ${issueCategories.length > 0 ? issueCategories.join(", ") : "none recorded"}.
${behaviorLines}`;
}

function formatReportLimitations(audit: AuditRecord) {
  const limits = [
    "This is a bounded public-URL audit, not a claim of human-equivalent usability testing, security scanning, accessibility certification, or private-app coverage.",
    "SwarmProof does not use credentials and stops before signup, login, checkout, payment, contact-sales, booking, destructive, or private-data actions.",
    audit.provider === "local-playwright"
      ? "Evidence comes from a constrained local Playwright worker with short step and persona budgets."
      : "Evidence comes from deterministic fallback or stored callbacks, so live external browser coverage may be limited."
  ];

  if (!audit.preflight.isDemoTarget) {
    limits.push("External report conclusions are limited to same-origin public pages reached safely during this run.");
  }

  return limits.map((item) => `- ${item}`).join("\n");
}

function formatProductRecommendations(audit: AuditRecord) {
  if (audit.issues.length === 0) {
    return "- Keep the public path observable before account creation, and add a regression check around the evidence steps SwarmProof reached.";
  }

  return audit.issues.slice(0, 5).map((issue) => {
    return `- ${issue.title}: ${safeLine(issue.suggestedFix ?? implementationHintForIssue(issue), 220)}`;
  }).join("\n");
}

function formatIssueEvidence(audit: AuditRecord, issue: AuditIssueSummary, index: number) {
  const evidence = evidenceForIssue(audit, issue);
  return `### ${index}. ${issue.title}
- Severity: ${issue.severity}
- Category: ${issue.category}
- Description: ${safeLine(issue.description)}
- Suggested fix: ${safeLine(issue.suggestedFix ?? "Review the affected flow and tighten the user path.")}
- Evidence:
${evidence.map((item) => formatStepEvidence(audit, item)).join("\n") || "  - No linked evidence steps were captured."}`;
}

function formatBugExport(audit: AuditRecord, issue: AuditIssueSummary, index: number) {
  const evidence = evidenceForIssue(audit, issue).slice(0, 5);
  const reproSteps = evidence.map(({ step }, stepIndex) => `${stepIndex + 1}. ${humanizeAction(step.action)}: ${safeLine(step.result, 220)}`).join("\n");
  const evidenceRefs = evidence.map(({ step }) => step.artifactId ?? step.id).join(", ");
  const likelyArea = likelyAreaForIssue(issue);
  const suggestedImplementation = implementationHintForIssue(issue);

  return `### Bug ${index}: ${issue.title}
- Severity: ${issue.severity}
- Area: ${issue.category}
- Target: ${displayTarget(audit)}
- Goal: ${audit.goal}
- User impact: ${userImpactForIssue(issue)}
- Likely area: ${likelyArea}
- Actual: ${safeLine(issue.description)}
- Expected: User can complete "${safeLine(audit.goal, 180)}" without this blocker.
- Repro steps:
${reproSteps || "1. Re-run the SwarmProof persona and inspect the linked issue."}
- Evidence refs: ${evidenceRefs || "No explicit step references"}
- Suggested implementation: ${suggestedImplementation}
- Regression-test note: Add or update a Playwright test that follows the linked repro steps and asserts the corrected, non-committing user-visible state.`;
}

function formatArtifactReference(audit: AuditRecord, artifact: ArtifactSummary) {
  const run = artifact.runId ? audit.runs.find((candidate) => candidate.id === artifact.runId) : undefined;
  const stepIndex = typeof artifact.meta?.stepIndex === "number" ? `, step ${artifact.meta.stepIndex}` : "";
  const content = artifact.contentType ? `, ${artifact.contentType}` : "";
  return `- ${artifact.kind}: ${artifact.id}${run ? `, ${run.mode}` : ""}${stepIndex}${content}`;
}

function evidenceForIssue(audit: AuditRecord, issue: AuditIssueSummary) {
  const linkedIds = new Set(issue.evidenceStepIds ?? []);
  const allEvidence = collectStepEvidence(audit);
  const linkedEvidence = allEvidence.filter(({ step }) => linkedIds.has(step.id));
  if (linkedEvidence.length > 0) {
    return linkedEvidence;
  }

  const issueText = `${issue.title} ${issue.description} ${issue.category}`.toLowerCase();
  const keywordEvidence = allEvidence.filter(({ step }) => {
    const stepText = `${step.action} ${step.result} ${step.thought ?? ""}`.toLowerCase();
    return issueText.split(/\W+/).filter((word) => word.length > 4).some((word) => stepText.includes(word));
  });
  return keywordEvidence.slice(0, 3);
}

function formatStepEvidence(audit: AuditRecord, evidence: StepEvidence) {
  const { run, step } = evidence;
  const status = step.status ? `, ${step.status}` : "";
  const artifact = step.artifactId ? `; artifact ${step.artifactId}` : step.screenshotUrl ? "; screenshot captured" : "";
  const location = displayStepLocation(audit, step.url);
  const at = location ? ` at ${location}` : "";
  const thought = step.thought ? ` Reasoning: ${safeLine(step.thought, 180)}` : "";
  return `  - ${run.mode} step ${step.stepIndex}${status}: ${humanizeAction(step.action)} -> ${safeLine(step.result)}${at}${artifact}${thought}`;
}

function stopReasonForRun(audit: AuditRecord, run: AuditRunSummary) {
  const stepStop = [...(run.steps ?? [])]
    .reverse()
    .map((step) => /Stop reason:\s*([^.;]+(?:[.;]|$))/i.exec(`${step.result} ${step.thought ?? ""}`)?.[1])
    .find((value): value is string => Boolean(value));
  if (stepStop) {
    return stepStop;
  }

  const runStepIds = new Set((run.steps ?? []).map((step) => step.id));
  const linkedIssue = audit.issues.find((issue) => (issue.evidenceStepIds ?? []).some((stepId) => runStepIds.has(stepId)));
  if (linkedIssue) {
    return linkedIssue.category === "Safety stop"
      ? "Stopped before an irreversible public-site commitment boundary."
      : linkedIssue.category === "Auth-limited flow"
        ? "Stopped at an authentication, CAPTCHA, verification, or private-access boundary."
        : safeLine(linkedIssue.description, 180);
  }

  if (run.status === "SUCCEEDED") {
    return "Persona found enough public evidence for this bounded goal.";
  }
  if (run.status === "TIMED_OUT") {
    return "Persona timed out before a terminal worker callback arrived.";
  }
  if (run.status === "BLOCKED") {
    return "Persona stopped because the next step was unsafe, unclear, or unavailable.";
  }
  if (run.status === "FAILED") {
    return "Persona failed after collected evidence showed the path could not continue cleanly.";
  }
  return "Persona has not reached a terminal stop reason yet.";
}

function buildAiReportPrompt(audit: AuditRecord) {
  const stats = collectEvidenceStats(audit);
  const digest = {
    target: displayTarget(audit),
    goal: audit.goal,
    provider: audit.provider,
    stats,
    runs: audit.runs.map((run) => ({
      persona: run.persona,
      mode: run.mode,
      profile: personaProfileForMode(run.mode),
      status: run.status,
      summary: safeLine(run.summary, 300),
      stopReason: stopReasonForRun(audit, run),
      steps: (run.steps ?? []).map((step) => ({
        id: step.id,
        stepIndex: step.stepIndex,
        action: step.action,
        status: step.status ?? "passed",
        result: safeLine(step.result, 260),
        thought: step.thought ? safeLine(step.thought, 180) : undefined,
        location: displayStepLocation(audit, step.url),
        artifactId: step.artifactId
      }))
    })),
    issues: audit.issues.map((issue) => ({
      id: issue.id,
      severity: issue.severity,
      category: issue.category,
      title: issue.title,
      description: safeLine(issue.description, 360),
      evidenceStepIds: issue.evidenceStepIds ?? [],
      suggestedFix: issue.suggestedFix
    })),
    artifacts: audit.artifacts.map((artifact) => ({
      id: artifact.id,
      kind: artifact.kind,
      runId: artifact.runId,
      meta: artifact.meta
    }))
  };
  return `Write JSON with optional keys summary, markdown, and generatedTest. Do not invent evidence or include raw screenshots.\n${JSON.stringify(digest, null, 2)}`;
}

function sanitizeAiReportDraft(draft: AiReportDraft): AiReportDraft {
  return {
    summary: sanitizeAiText(draft.summary, 700),
    markdown: sanitizeAiText(draft.markdown, 14000),
    generatedTest: isUsableGeneratedTest(draft.generatedTest) ? draft.generatedTest : undefined
  };
}

function sanitizeAiText(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return undefined;
  }

  if (/data:image|base64,/i.test(value)) {
    return undefined;
  }

  return value.trim().slice(0, maxLength) || undefined;
}

function isUsableGeneratedTest(value: unknown): value is string {
  return typeof value === "string" && value.length < 16000 && /page\.goto/.test(value) && /expect/.test(value);
}

function displayTarget(audit: AuditRecord) {
  return audit.preflight.isDemoTarget ? "/demo-target" : audit.normalizedUrl ?? audit.targetUrl;
}

function displayStepLocation(audit: AuditRecord, value?: string) {
  if (!value) {
    return undefined;
  }

  try {
    const url = new URL(value);
    const target = audit.normalizedUrl ? new URL(audit.normalizedUrl) : undefined;
    if (audit.preflight.isDemoTarget || target?.hostname === url.hostname) {
      return url.pathname;
    }
    return `${url.origin}${url.pathname}`;
  } catch {
    return value.startsWith("/") ? value : undefined;
  }
}

function humanizeAction(action: string) {
  return action.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function safeLine(value: string, maxLength = 280) {
  return value.replace(/\s+/g, " ").replace(/\|/g, "/").trim().slice(0, maxLength);
}

function pluralize(count: number, label: string) {
  return `${count} ${label}${count === 1 ? "" : "s"}`;
}

function severityRank(severity: AuditIssueSummary["severity"]) {
  if (severity === "CRITICAL") return 4;
  if (severity === "HIGH") return 3;
  if (severity === "MEDIUM") return 2;
  return 1;
}

function issueDedupeKey(issue: Pick<AuditIssueSummary, "category" | "title">) {
  return `${issue.category.toLowerCase().replace(/\s+/g, " ")}:${issue.title.toLowerCase().replace(/\s+/g, " ")}`;
}

function userImpactForIssue(issue: AuditIssueSummary) {
  if (issue.category === "Safety stop") {
    return "Users can inspect the public product path, but QA must stop before irreversible commerce or private-data actions.";
  }

  if (issue.category === "Auth-limited flow") {
    return "Unauthenticated users cannot continue the audited goal without login, verification, or owner-provided test access.";
  }

  if (issue.category === "Agent uncertainty") {
    return "A first-time user may not see a clear safe next action for the stated goal.";
  }

  if (["Execution", "Execution setup", "Execution timeout", "Worker crash", "Console", "Network"].includes(issue.category)) {
    return "The audit evidence is limited by a technical blocker that should be checked before trusting the flow.";
  }

  return "Users may lose momentum or confidence while trying to complete the stated goal.";
}

function likelyAreaForIssue(issue: AuditIssueSummary) {
  if (issue.category === "Safety stop") return "Public product/configuration flow before checkout";
  if (issue.category === "Auth-limited flow") return "Authentication, verification, or access gating";
  if (issue.category === "Agent uncertainty") return "CTA labeling, navigation, and information architecture";
  if (issue.category === "Console") return "Frontend runtime";
  if (issue.category === "Network") return "Network/API or asset loading";
  if (issue.category === "Execution setup") return "SwarmProof worker configuration";
  if (issue.category === "Execution timeout") return "SwarmProof worker timeout and callback delivery";
  if (issue.category === "Worker crash") return "SwarmProof browser worker runtime";
  return issue.category;
}

function implementationHintForIssue(issue: AuditIssueSummary) {
  if (issue.category === "Safety stop") {
    return safeLine(issue.suggestedFix ?? "Expose product configuration and pricing review states before Add to Bag, Checkout, Pay, or private-data collection.");
  }

  if (issue.category === "Auth-limited flow") {
    return safeLine(issue.suggestedFix ?? "Provide a public unauthenticated path for the audited goal, or add a future owner-approved authenticated test setup.");
  }

  return safeLine(issue.suggestedFix ?? "Review the affected flow, clarify the visible CTA or state, and verify the behavior with an evidence-backed Playwright regression.");
}

function calculateScore(audit: AuditRecord) {
  const penalty = audit.issues.reduce((total, issue) => {
    if (issue.severity === "CRITICAL") return total + 35;
    if (issue.severity === "HIGH") return total + 24;
    if (issue.severity === "MEDIUM") return total + 14;
    return total + 6;
  }, 0);
  return Math.max(15, 100 - penalty);
}

export function finalizeTimedOutAudit(auditId: string, options: TimeoutFinalizationOptions = {}) {
  const audit = requireAudit(auditId);
  if (finalizeTimedOutAuditRecord(audit, options)) {
    generateAuditReport(audit.id);
  }
  return toSummary(audit);
}

function finalizeTimedOutAuditRecord(audit: AuditRecord, options: TimeoutFinalizationOptions = {}) {
  if (audit.status !== "RUNNING" || audit.runs.length === 0) {
    return false;
  }

  const now = toDate(options.now) ?? new Date();
  const personaBudget = options.personaTimeoutMs ?? personaTimeoutMs();
  const auditBudget = options.auditTimeoutMs ?? auditTimeoutMs(audit.runs.length);
  const auditStartedAt = earliestRunStart(audit) ?? toDate(audit.createdAt) ?? toDate(audit.updatedAt) ?? now;
  const auditTimedOut = now.getTime() - auditStartedAt.getTime() >= auditBudget;
  let changed = false;

  for (const run of audit.runs) {
    if (FINAL_RUN_STATUSES.includes(run.status)) {
      continue;
    }

    const runStartedAt = toDate(run.startedAt);
    const personaTimedOut = runStartedAt ? now.getTime() - runStartedAt.getTime() >= personaBudget : false;
    if (!auditTimedOut && !personaTimedOut) {
      continue;
    }

    const stepIds = run.steps?.map((step) => step.id) ?? [];
    if (stepIds.length === 0) {
      const step = addStep(run, {
        stepIndex: 1,
        action: "timeout_watchdog",
        status: "failed",
        thought: "Finalize a live worker run that did not send a terminal callback.",
        result: auditTimedOut
          ? "Audit-level timeout elapsed before this persona produced a final callback."
          : "Persona-level timeout elapsed before the worker produced a final callback.",
        url: audit.normalizedUrl ?? audit.targetUrl
      });
      stepIds.push(step.id);
    }

    run.status = "TIMED_OUT";
    run.success = false;
    run.summary = auditTimedOut
      ? "Audit watchdog timed out before the browser worker finished this persona. Partial evidence is available."
      : "Persona watchdog timed out before the browser worker finished this run. Partial evidence is available.";
    run.finishedAt = now.toISOString();
    finishJobForRun(audit, run);
    addIssue(audit, {
      severity: "MEDIUM",
      category: "Execution timeout",
      title: "Browser worker timed out before finishing",
      description: auditTimedOut
        ? "The audit-level watchdog settled this persona so the run could produce a partial report instead of staying RUNNING."
        : "The persona-level watchdog settled this run so the audit could produce a partial report instead of staying RUNNING.",
      evidenceStepIds: stepIds,
      suggestedFix: "Retry the persona after checking worker health, target page weight, and callback delivery."
    });
    appendEvent("persona_timed_out", audit.id, {
      persona: run.mode,
      auditTimedOut,
      stepCount: stepIds.length
    });
    changed = true;
  }

  if (changed) {
    completeAuditIfReady(audit);
    touch(audit);
  }

  return changed;
}

function completeAuditIfReady(audit: AuditRecord) {
  if (audit.runs.length > 0 && audit.runs.every((run) => FINAL_RUN_STATUSES.includes(run.status))) {
    audit.status = "COMPLETED";
    audit.completedAt = new Date().toISOString();
    touch(audit);
  }
}

function toSummary(audit: AuditRecord): AuditSummary {
  const report = audit.report;
  return {
    id: audit.id,
    targetUrl: audit.targetUrl,
    normalizedUrl: audit.normalizedUrl,
    goal: audit.goal,
    status: audit.status,
    provider: audit.provider,
    maxSteps: audit.maxSteps,
    preflight: audit.preflight,
    errorCode: audit.errorCode,
    errorMessage: audit.errorMessage,
    completedAt: audit.completedAt,
    score: report?.score ?? calculateScore(audit),
    shareToken: audit.shareToken,
    runs: audit.runs,
    issues: audit.issues,
    artifacts: audit.artifacts,
    jobs: audit.jobs,
    generatedTest: report?.reportJson.playwrightTests[0]?.code ?? buildGeneratedTest(audit),
    report,
    eventCount: audit.eventCount,
    createdAt: audit.createdAt,
    updatedAt: audit.updatedAt
  };
}

function eventNameForRunStatus(status: RunStatus) {
  if (status === "SUCCEEDED") return "run_completed";
  if (status === "TIMED_OUT") return "persona_timed_out";
  if (status === "FAILED") return "persona_failed";
  return "persona_blocked";
}

function requireAudit(auditId: string) {
  const audit = getAudit(auditId);
  if (!audit) {
    throw new Error("Audit not found.");
  }

  return audit;
}

function requireRun(runId: string) {
  for (const audit of getStore().audits.values()) {
    const run = audit.runs.find((candidate) => candidate.id === runId);
    if (run) {
      return { audit, run };
    }
  }

  throw new Error("Run not found.");
}

function touch(audit: AuditRecord) {
  audit.updatedAt = new Date().toISOString();
}

function personaTimeoutMs() {
  return positiveEnvNumber("SWARMPROOF_PERSONA_TIMEOUT_MS", DEFAULT_PERSONA_TIMEOUT_MS);
}

function workerPersonaTimeoutMs() {
  return Math.max(10_000, personaTimeoutMs() - 10_000);
}

function auditTimeoutMs(runCount: number) {
  const defaultBudget = Math.max(DEFAULT_AUDIT_TIMEOUT_MS, personaTimeoutMs() * Math.max(runCount, 1) + 30_000);
  return positiveEnvNumber("SWARMPROOF_AUDIT_TIMEOUT_MS", defaultBudget);
}

function positiveEnvNumber(key: string, fallback: number) {
  const parsed = Number(process.env[key]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function earliestRunStart(audit: AuditRecord) {
  const starts = audit.runs
    .map((run) => toDate(run.startedAt))
    .filter((value): value is Date => Boolean(value))
    .sort((left, right) => left.getTime() - right.getTime());
  return starts[0];
}

function toDate(value: Date | string | undefined) {
  if (!value) return undefined;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function normalizeModes(modes?: string[]): PersonaMode[] {
  const requested = (modes?.length ? modes : ["normal", "mobile", "chaos"])
    .map((mode) => mode.replace("-", "_"))
    .filter((mode): mode is PersonaMode => ["normal", "mobile", "impatient", "chaos", "accessibility_lite"].includes(mode));
  return requested.length > 0 ? [...new Set(requested)] : ["normal", "mobile", "chaos"];
}

function createJob(audit: AuditRecord, runId?: string, status: AuditJobSummary["status"] = "DISPATCHED") {
  const now = new Date().toISOString();
  const job: AuditJobSummary = {
    id: createId("job"),
    auditId: audit.id,
    runId,
    status,
    provider: audit.provider,
    attempts: 1,
    retryCount: 0,
    queuedAt: now,
    createdAt: now,
    updatedAt: now
  };
  audit.jobs.push(job);
  getStore().jobs.set(job.id, job);
  return job;
}

function finishJobForRun(audit: AuditRecord, run: AuditRunSummary) {
  const job = audit.jobs.find((candidate) => candidate.runId === run.id);
  if (!job) return;

  const now = new Date().toISOString();
  job.status = run.status === "SUCCEEDED"
    ? "SUCCEEDED"
    : run.status === "TIMED_OUT"
      ? "TIMED_OUT"
      : run.status === "FAILED" || run.status === "BLOCKED"
        ? "FAILED"
        : "RUNNING";
  job.updatedAt = now;
  job.heartbeatAt = job.heartbeatAt ?? now;
  if (run.status === "TIMED_OUT") {
    job.timedOutAt = run.finishedAt ?? now;
  }
  if (run.status === "FAILED" || run.status === "BLOCKED" || run.status === "TIMED_OUT") {
    job.lastError = run.summary;
  }
}

function markJobRunningForRun(audit: AuditRecord, run: AuditRunSummary) {
  const job = audit.jobs.find((candidate) => candidate.runId === run.id);
  if (!job || FINAL_RUN_STATUSES.includes(run.status)) return;

  const now = new Date().toISOString();
  if (["QUEUED", "DISPATCHED", "RUNNING"].includes(job.status)) {
    job.status = "RUNNING";
  }
  job.startedAt = job.startedAt ?? now;
  job.lockedAt = job.lockedAt ?? now;
  job.heartbeatAt = now;
  job.updatedAt = now;
}

function createArtifact(
  audit: AuditRecord,
  input: {
    runId?: string;
    kind: ArtifactKind;
    url: string;
    storageKey?: string;
    contentType?: string;
    sizeBytes?: number;
    meta?: Record<string, string | number | boolean | null>;
  }
) {
  const artifact: ArtifactSummary = {
    id: createId("artifact"),
    auditId: audit.id,
    runId: input.runId,
    kind: input.kind,
    url: input.url,
    storageKey: input.storageKey,
    contentType: input.contentType,
    sizeBytes: input.sizeBytes,
    meta: input.meta,
    createdAt: new Date().toISOString()
  };

  audit.artifacts.push(artifact);
  const run = input.runId ? audit.runs.find((candidate) => candidate.id === input.runId) : undefined;
  if (run) {
    run.artifacts = [...(run.artifacts ?? []), artifact];
  }
  getStore().artifacts.set(artifact.id, artifact);
  return artifact;
}

function normalizeArtifactKind(value: string): ArtifactKind {
  return ["SCREENSHOT", "TRACE_ZIP", "HAR", "CONSOLE_LOG", "NETWORK_LOG", "VIDEO"].includes(value)
    ? value as ArtifactKind
    : "SCREENSHOT";
}

function personaForMode(mode: PersonaMode): PersonaConfig {
  const existing = defaultPersonas.find((persona) => persona.mode === mode);
  if (existing) return existing;
  return personaProfileForMode(mode);
}

function isPrivateOrInternalHost(host: string) {
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    return true;
  }

  if (!host.includes(".") && !host.includes(":")) {
    return true;
  }

  if (host === "169.254.169.254" || host === "metadata.google.internal") {
    return true;
  }

  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = v4.slice(1).map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }

  const v6 = host.replace(/^\[|\]$/g, "");
  return v6 === "::1" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80:") || v6.startsWith("::ffff:127.");
}

function sanitizeEventProps(props: Record<string, unknown>) {
  const safe: SafeProps = {};
  for (const [key, value] of Object.entries(props)) {
    const lowerKey = key.toLowerCase();
    if (UNSAFE_EVENT_KEYS.some((unsafe) => lowerKey.includes(unsafe))) {
      continue;
    }

    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) {
      safe[key] = value;
    }
  }
  return safe;
}

function fallbackFrame(mode: PersonaMode, text: string) {
  const label = `${mode}: ${text}`.slice(0, 86);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540"><rect width="960" height="540" fill="#eef4f1"/><rect x="48" y="56" width="864" height="428" rx="16" fill="#ffffff" stroke="#c9d6d1"/><text x="84" y="142" font-family="Arial" font-size="28" font-weight="700" fill="#10201b">SwarmProof evidence frame</text><text x="84" y="206" font-family="Arial" font-size="22" fill="#3f5f55">${escapeXml(label)}</text><text x="84" y="270" font-family="Arial" font-size="16" fill="#667b73">Deterministic demo fallback, no external browser credentials required.</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function createId(prefix: string) {
  const uuid = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return `${prefix}_${uuid.replace(/-/g, "").slice(0, 18)}`;
}

function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char] ?? char);
}

function escapeForSingleQuotedString(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
