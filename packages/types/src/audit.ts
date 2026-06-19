import type { PersonaMode } from "./agent";

export type AuditStatus = "CREATED" | "PREFLIGHT" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
export type RunStatus = "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "BLOCKED";
export type IssueSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type AuditOutcome = "pass" | "partial" | "fail";

export type BrowserStepSummary = {
  id: string;
  runId: string;
  stepIndex: number;
  action: string;
  thought?: string;
  url?: string;
  result: string;
  screenshotUrl?: string;
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
  score: number;
  shareToken?: string;
  runs: AuditRunSummary[];
  issues: AuditIssueSummary[];
  generatedTest: string;
  report?: AuditReportSummary;
  eventCount?: number;
  createdAt?: string;
  updatedAt?: string;
};
