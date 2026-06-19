import type { PersonaMode } from "./agent";

export type AuditStatus = "CREATED" | "PREFLIGHT" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
export type RunStatus = "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "BLOCKED";
export type IssueSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type AuditOutcome = "pass" | "partial" | "fail";
export type ArtifactKind = "SCREENSHOT" | "TRACE_ZIP" | "HAR" | "CONSOLE_LOG" | "NETWORK_LOG" | "VIDEO";
export type AuditProvider = "demo" | "memory-demo-adapter" | "prisma-ready" | "postgres" | "local-playwright" | "browserbase-stagehand";
export type AuditJobStatus = "QUEUED" | "DISPATCHED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";

export type AuditPreflightSummary = {
  loadable: boolean;
  blockedReason?: string;
  normalizedUrl: string;
  isDemoTarget: boolean;
};

export type ArtifactSummary = {
  id: string;
  auditId?: string;
  runId?: string;
  kind: ArtifactKind;
  url: string;
  storageKey?: string;
  contentType?: string;
  sizeBytes?: number;
  meta?: Record<string, string | number | boolean | null>;
  createdAt: string;
};

export type AuditJobSummary = {
  id: string;
  auditId: string;
  runId?: string;
  status: AuditJobStatus;
  provider: AuditProvider;
  attempts: number;
  lockedAt?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
};

export type BrowserStepSummary = {
  id: string;
  runId: string;
  stepIndex: number;
  action: string;
  status?: "passed" | "warning" | "failed";
  thought?: string;
  url?: string;
  result: string;
  screenshotUrl?: string;
  artifactId?: string;
  createdAt: string;
};

export type AuditRunSummary = {
  id: string;
  persona: string;
  mode: PersonaMode;
  status: RunStatus;
  summary: string;
  viewport?: string;
  success?: boolean;
  startedAt?: string;
  finishedAt?: string;
  steps?: BrowserStepSummary[];
  artifacts?: ArtifactSummary[];
};

export type AuditIssueSummary = {
  id: string;
  severity: IssueSeverity;
  category: string;
  title: string;
  description: string;
  evidenceStepIds?: string[];
  suggestedFix?: string;
  generatedTest?: string;
};

export type AuditEventSummary = {
  id: string;
  auditId?: string;
  name: string;
  props: Record<string, string | number | boolean | null>;
  createdAt: string;
};

export type AuditReportSummary = {
  id: string;
  auditId: string;
  summary: string;
  score: number;
  outcome: AuditOutcome;
  markdown: string;
  reportJson: {
    outcome: AuditOutcome;
    issues: AuditIssueSummary[];
    playwrightTests: Array<{ name: string; code: string }>;
  };
  createdAt: string;
};

export type AuditSummary = {
  id: string;
  targetUrl: string;
  normalizedUrl?: string;
  goal: string;
  status: AuditStatus;
  provider?: AuditProvider;
  maxSteps?: number;
  preflight?: AuditPreflightSummary;
  errorCode?: string;
  errorMessage?: string;
  completedAt?: string;
  score: number;
  shareToken?: string;
  runs: AuditRunSummary[];
  issues: AuditIssueSummary[];
  artifacts?: ArtifactSummary[];
  jobs?: AuditJobSummary[];
  generatedTest: string;
  report?: AuditReportSummary;
  eventCount?: number;
  createdAt?: string;
  updatedAt?: string;
};
