import type { PersonaConfig } from "./agent";
import type { ArtifactKind, IssueSeverity } from "./audit";

export type AgentAction =
  | { type: "click_text"; text: string; reason: string }
  | { type: "fill_label"; label: string; value: string; reason: string }
  | { type: "select_label"; label: string; value: string; reason: string }
  | { type: "press"; key: string; reason: string }
  | { type: "goto"; url: string; reason: string }
  | { type: "wait"; ms: number; reason: string }
  | { type: "back"; reason: string }
  | { type: "screenshot"; reason: string }
  | { type: "done"; reason: string; evidence: string }
  | { type: "fail"; reason: string; evidence: string };

export type WorkerRunAgentRequest = {
  auditId: string;
  runId: string;
  targetUrl: string;
  goal: string;
  persona: PersonaConfig;
  maxSteps: number;
  callbackBaseUrl: string;
  runMode?: "demo-target" | "external-public";
  allowExternalFormSubmissions?: boolean;
};

export type WorkerStepCallback = {
  auditId?: string;
  runId: string;
  stepIndex: number;
  action: string;
  status?: "passed" | "warning" | "failed";
  thought?: string;
  result: string;
  screenshotBase64?: string;
  screenshotUrl?: string;
  artifactId?: string;
  url?: string;
};

export type WorkerIssueCallback = {
  severity: IssueSeverity;
  category: string;
  title: string;
  description: string;
  evidenceStepIds?: string[];
  suggestedFix?: string;
  generatedTest?: string;
};

export type WorkerCompleteCallback = {
  auditId?: string;
  runId: string;
  success: boolean;
  summary: string;
  status?: "SUCCEEDED" | "FAILED" | "BLOCKED";
  issues?: WorkerIssueCallback[];
  artifacts?: Array<{ type: ArtifactKind | string; url: string; meta?: Record<string, string | number | boolean> }>;
};

export type WorkerHealthSummary = {
  service: "swarmproof-browser-worker";
  provider: "deterministic-demo" | "local-playwright";
  playwrightAvailable: boolean;
  personas: string[];
};
