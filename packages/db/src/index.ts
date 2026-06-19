import { defaultPersonas, type PersonaConfig, type PersonaMode } from "@swarmproof/types";
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

declare global {
  var __swarmproofStore: Store | undefined;
}

const UNSAFE_EVENT_KEYS = ["url", "content", "screenshot", "secret", "token", "password", "email", "credential"];
const FINAL_RUN_STATUSES: RunStatus[] = ["SUCCEEDED", "FAILED", "BLOCKED"];

export function getDatabaseStatus() {
  return {
    configured: Boolean(process.env.DATABASE_URL),
    provider: getActiveProvider(),
    activeAdapter: "memory",
    dbBacked: false,
    prismaReady: true,
    note: process.env.DATABASE_URL
      ? "DATABASE_URL is configured; Prisma schema and repository boundary are ready, but runtime still uses the memory fallback until Prisma client wiring is enabled."
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
    issueCount: audit.issues.length
  };
}

export function generateAuditReport(auditId: string) {
  const audit = requireAudit(auditId);
  const generatedTest = buildGeneratedTest(audit);
  const outcome = audit.issues.some((issue) => issue.severity === "HIGH" || issue.severity === "CRITICAL")
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
  if (!audit.preflight.isDemoTarget) {
    if (audit.issues.some((issue) => issue.category === "Execution setup")) {
      return "The target passed safety checks, but browser execution did not complete in this environment.";
    }

    if (audit.provider === "local-playwright") {
      return "The local Playwright worker loaded the public target, collected evidence, and produced a safety-limited external URL report.";
    }

    return "The target passed safety checks, but external browser execution is not configured in this demo build.";
  }

  return "The demo flow is partially usable, but the swarm found mobile CTA visibility, ambiguous invite copy, and duplicate-submit friction.";
}

function buildMarkdownReport(audit: AuditRecord, score: number, outcome: string, generatedTest: string) {
  const issueLines = audit.issues.map((issue) => `- ${issue.severity}: ${issue.title} - ${issue.suggestedFix ?? "Review the affected flow."}`).join("\n");
  return `# SwarmProof audit report

Outcome: ${outcome}
Score: ${score}

${buildReportSummary(audit)}

## Issues
${issueLines || "- No issues detected in this run."}

## Generated Playwright starter

\`\`\`ts
${generatedTest}
\`\`\`
`;
}

function buildGeneratedTest(audit: AuditRecord) {
  const target = audit.preflight.isDemoTarget ? "/demo-target" : audit.normalizedUrl ?? audit.targetUrl;
  return `import { test, expect } from '@playwright/test';

test('swarmproof generated smoke test', async ({ page }) => {
  await page.goto('${escapeForSingleQuotedString(target)}');
  await page.getByRole('link', { name: /get started|sign up/i }).click();
  await page.getByLabel(/email/i).fill('demo@example.com');
  await page.getByLabel(/password/i).fill('TestPassword123!');
  await page.getByRole('button', { name: /create account|sign up/i }).click();
  // TODO: selector was inferred from the SwarmProof trace; verify before committing.
  await expect(page.getByText(/project|people|invite/i)).toBeVisible();
});
`;
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
