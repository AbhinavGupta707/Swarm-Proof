import { defaultPersonas, type PersonaConfig, type PersonaMode } from "@swarmproof/types";
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

declare global {
  var __swarmproofStore: Store | undefined;
  var __swarmproofPgPool: Pool | undefined;
  var __swarmproofPgReady: Promise<void> | undefined;
}

const UNSAFE_EVENT_KEYS = ["url", "content", "screenshot", "secret", "token", "password", "email", "credential"];
const FINAL_RUN_STATUSES: RunStatus[] = ["SUCCEEDED", "FAILED", "BLOCKED"];

export function getDatabaseStatus() {
  const dbBacked = shouldUsePostgresPersistence();
  return {
    configured: Boolean(process.env.DATABASE_URL),
    provider: getActiveProvider(),
    activeAdapter: dbBacked ? "postgres" : "memory",
    dbBacked,
    prismaReady: true,
    note: dbBacked
      ? "DATABASE_URL is configured; using the Postgres audit snapshot adapter with memory fallback for local tests."
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
  return readPersistedAudit(auditId, () => getAuditOverview(auditId));
}

export async function getAuditEventsAsync(auditId: string) {
  return readPersistedAudit(auditId, () => getAuditEvents(auditId));
}

export async function generateAuditReportAsync(auditId: string) {
  return mutatePersistedAudit(auditId, () => generateAuditReport(auditId));
}

export async function createShareAsync(auditId: string, baseUrl: string) {
  return mutatePersistedAudit(auditId, () => createShare(auditId, baseUrl));
}

export async function getSharedReportAsync(shareToken: string) {
  if (!shouldUsePostgresPersistence()) {
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

async function readPersistedAudit<T>(auditId: string, operation: () => T): Promise<T> {
  if (!shouldUsePostgresPersistence()) {
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
  if (!shouldUsePostgresPersistence()) {
    return operation();
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
    await writeSnapshot(client, auditId);
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
  if (!shouldUsePostgresPersistence()) {
    return;
  }

  await ensurePostgresPersistence();
  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [auditId]);
    await writeSnapshot(client, auditId);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function readSnapshotByAuditId(auditId: string, client?: PoolClient): Promise<AuditSnapshot | undefined> {
  if (!shouldUsePostgresPersistence()) {
    return undefined;
  }

  await ensurePostgresPersistence();
  const runner = client ?? getPostgresPool();
  const result = await runner.query<{ data: AuditSnapshot | string }>(
    "SELECT data FROM swarmproof_audit_snapshots WHERE id = $1 LIMIT 1",
    [auditId]
  );
  return parseSnapshot(result.rows[0]?.data);
}

async function readSnapshotByShareToken(shareToken: string): Promise<AuditSnapshot | undefined> {
  await ensurePostgresPersistence();
  const result = await getPostgresPool().query<{ data: AuditSnapshot | string }>(
    "SELECT data FROM swarmproof_audit_snapshots WHERE share_token = $1 LIMIT 1",
    [shareToken]
  );
  return parseSnapshot(result.rows[0]?.data);
}

async function findPersistedAuditIdForRun(runId: string): Promise<string> {
  if (!shouldUsePostgresPersistence()) {
    const match = [...getStore().audits.values()].find((audit) => audit.runs.some((run) => run.id === runId));
    if (!match) throw new Error("Run not found.");
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

async function writeSnapshot(client: PoolClient, auditId: string) {
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
  return Boolean(process.env.DATABASE_URL) && process.env.SWARMPROOF_PERSISTENCE !== "memory";
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
      run.status = "RUNNING";
      run.startedAt = new Date().toISOString();
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
  return toSummary(requireAudit(auditId));
}

export function getAuditEvents(auditId: string) {
  const audit = requireAudit(auditId);
  const runSteps = audit.runs.flatMap((run) => run.steps ?? []);
  const events = getStore().events.filter((event) => event.auditId === audit.id);
  return {
    events,
    steps: runSteps,
    runs: audit.runs,
    status: audit.status,
    issueCount: audit.issues.length,
    issues: audit.issues,
    artifacts: audit.artifacts,
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
  const generatedTest = buildGeneratedTest(audit);
  const outcome: AuditOutcomeValue = audit.issues.some((issue) => issue.severity === "HIGH" || issue.severity === "CRITICAL")
    ? "fail"
    : audit.issues.length > 0
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
  run.status = "RUNNING";
  touch(audit);
  appendEvent("browser_step_completed", audit.id, { persona: run.mode, stepIndex: step.stepIndex });
  return step;
}

export function completeWorkerRun(input: WorkerCompleteCallback) {
  const { audit, run } = requireRun(input.runId);
  run.status = input.status ?? (input.success ? "SUCCEEDED" : "FAILED");
  run.success = input.success;
  run.summary = input.summary;
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

  appendEvent(input.success ? "run_completed" : "persona_blocked", audit.id, {
    persona: run.mode,
    success: input.success,
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
    startedAt: new Date().toISOString(),
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
    if (audit.issues.some((issue) => issue.category === "Execution setup")) {
      return `The target passed safety checks, but browser execution did not complete beyond ${pluralize(stats.stepCount, "evidence step")}.`;
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

  return `# SwarmProof audit report

Outcome: ${outcome}
Score: ${score}
Target: ${displayTarget(audit)}
Goal: ${audit.goal}
Provider: ${audit.provider}
Evidence: ${pluralize(stats.stepCount, "browser step")} across ${pluralize(stats.runCount, "persona")}; ${pluralize(stats.screenshotCount, "screenshot frame")}; ${pluralize(stats.artifactCount, "artifact")}.

${buildReportSummary(audit)}

## Persona results
${personaSections || "- No persona runs have been recorded yet."}

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
    return `did not find a blocking issue; ${stats.succeededRunCount} of ${stats.runCount || 0} personas completed cleanly`;
  }

  const topIssue = stats.topIssue ? `, led by "${stats.topIssue.title}"` : "";
  return `found ${pluralize(stats.issueCount, "issue")}${topIssue}`;
}

function formatRunEvidence(audit: AuditRecord, run: AuditRunSummary) {
  const steps = (run.steps ?? []).slice(0, 8).map((step) => formatStepEvidence(audit, { run, step })).join("\n");
  return `### ${run.persona}
- Mode: ${run.mode}
- Viewport: ${run.viewport ?? "default"}
- Result: ${run.status} - ${safeLine(run.summary || "No run summary recorded.")}
- Evidence:
${steps || "  - No steps recorded."}`;
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

  return `### Bug ${index}: ${issue.title}
- Severity: ${issue.severity}
- Area: ${issue.category}
- Target: ${displayTarget(audit)}
- Goal: ${audit.goal}
- Actual: ${safeLine(issue.description)}
- Expected: User can complete "${safeLine(audit.goal, 180)}" without this blocker.
- Repro steps:
${reproSteps || "1. Re-run the SwarmProof persona and inspect the linked issue."}
- Evidence refs: ${evidenceRefs || "No explicit step references"}
- Suggested fix: ${safeLine(issue.suggestedFix ?? "Review the affected flow.")}`;
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
  return `  - ${run.mode} step ${step.stepIndex}${status}: ${humanizeAction(step.action)} -> ${safeLine(step.result)}${at}${artifact}`;
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
      status: run.status,
      summary: safeLine(run.summary, 300),
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

function calculateScore(audit: AuditRecord) {
  const penalty = audit.issues.reduce((total, issue) => {
    if (issue.severity === "CRITICAL") return total + 35;
    if (issue.severity === "HIGH") return total + 24;
    if (issue.severity === "MEDIUM") return total + 14;
    return total + 6;
  }, 0);
  return Math.max(15, 100 - penalty);
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

  job.status = run.status === "SUCCEEDED" ? "SUCCEEDED" : run.status === "FAILED" || run.status === "BLOCKED" ? "FAILED" : "RUNNING";
  job.updatedAt = new Date().toISOString();
  if (run.status === "FAILED" || run.status === "BLOCKED") {
    job.lastError = run.summary;
  }
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

  return {
    id: mode,
    mode,
    name: mode === "accessibility_lite" ? "Accessibility-lite user" : "Impatient user",
    viewport: { width: 1280, height: 800 },
    behaviorRules: ["Attempt the goal and report friction clearly."]
  };
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
