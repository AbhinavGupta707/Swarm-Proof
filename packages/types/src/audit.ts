import type { PersonaMode } from "./agent";

export type AuditStatus = "CREATED" | "PREFLIGHT" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
export type RunStatus = "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "BLOCKED";
export type IssueSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type AuditRunSummary = {
  id: string;
  persona: string;
  mode: PersonaMode;
  status: RunStatus;
  summary: string;
};

export type AuditIssueSummary = {
  id: string;
  severity: IssueSeverity;
  category: string;
  title: string;
  description: string;
  suggestedFix?: string;
};

export type AuditSummary = {
  id: string;
  targetUrl: string;
  goal: string;
  status: AuditStatus;
  score: number;
  shareToken?: string;
  runs: AuditRunSummary[];
  issues: AuditIssueSummary[];
  generatedTest: string;
};
