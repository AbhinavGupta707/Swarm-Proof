import type { AuditSummary, BrowserStepSummary, RunStatus } from "@swarmproof/types";
import { demoAudit, type DemoStep } from "./demo-data";

type UiStepStatus = "passed" | "warning" | "failed";

export type AuditMetric = {
  label: string;
  value: string;
  detail: string;
};

export type EvidenceFrame = {
  id: string;
  runId: string;
  step: string;
  title: string;
  viewport: string;
  state: string;
  finding: string;
  screenshotUrl?: string;
};

export type SuggestedFix = {
  title: string;
  owner: string;
  impact: string;
};

export function auditMetrics(audit: AuditSummary): AuditMetric[] {
  if (audit.id === demoAudit.id) {
    return demoAudit.metrics;
  }

  const stepCount = audit.runs.reduce((total, run) => total + (run.steps?.length ?? 0), 0);
  return [
    { label: "Personas", value: String(audit.runs.length || 3), detail: audit.runs.map((run) => run.mode).join(", ") || "normal, mobile, chaos" },
    { label: "Evidence frames", value: String(stepCount), detail: "Worker and deterministic screenshots" },
    { label: "Issues found", value: String(audit.issues.length), detail: severityBreakdown(audit) },
    { label: "Safe events", value: String(audit.eventCount ?? 0), detail: "Counts and states only" }
  ];
}

export function auditTimeline(audit: AuditSummary): DemoStep[] {
  if (audit.id === demoAudit.id) {
    return demoAudit.steps;
  }

  return audit.runs.flatMap((run) =>
    (run.steps ?? []).map((step) => ({
      id: step.id,
      runId: run.id,
      time: `#${step.stepIndex}`,
      label: humanizeAction(step.action),
      result: step.result,
      status: statusForRun(run.status, step),
      evidence: step.screenshotUrl ? "Evidence frame captured" : "Deterministic trace",
      url: step.url ?? audit.targetUrl
    }))
  );
}

export function evidenceFramesForRun(audit: AuditSummary, runId: string): EvidenceFrame[] {
  if (audit.id === demoAudit.id) {
    return demoAudit.evidenceFrames.filter((frame) => frame.runId === runId);
  }

  const run = audit.runs.find((item) => item.id === runId);
  return (run?.steps ?? []).map((step) => ({
    id: step.id,
    runId,
    step: `Step ${step.stepIndex}`,
    title: humanizeAction(step.action),
    viewport: run?.viewport ?? (run?.mode === "mobile" ? "390 x 844" : "desktop viewport"),
    state: step.result,
    finding: step.thought ?? run?.summary ?? "Captured during SwarmProof execution.",
    screenshotUrl: step.screenshotUrl
  }));
}

export function suggestedFixesForAudit(audit: AuditSummary): SuggestedFix[] {
  if (audit.id === demoAudit.id) {
    return demoAudit.suggestedFixes;
  }

  const actionItems = audit.report?.reportJson.actionPlan?.items;
  if (actionItems?.length) {
    return actionItems.map((item) => ({
      title: item.suggestedChange,
      owner: item.owner,
      impact: `${item.priority} · ${item.title}`
    }));
  }

  return audit.issues.map((issue) => ({
    title: issue.suggestedFix ?? `Review ${issue.category.toLowerCase()} friction`,
    owner: issue.category.includes("Mobile") || issue.category.includes("Validation") ? "Frontend" : "Product + Engineering",
    impact: issue.title
  }));
}

export function bugReportForAudit(audit: AuditSummary) {
  if (audit.id === demoAudit.id) {
    return demoAudit.bugReport;
  }

  return audit.report?.markdown ?? `## SwarmProof findings\n\n${audit.issues.map((issue) => `- ${issue.severity}: ${issue.title}`).join("\n")}`;
}

export function actionPlanMarkdownForAudit(audit: AuditSummary) {
  const actionPlan = audit.report?.reportJson.actionPlan;
  if (!actionPlan) {
    return `# SwarmProof PR suggestion\n\nNo action plan has been generated for this audit yet.`;
  }

  return `# ${actionPlan.pullRequestDraft.title}

Suggested branch: \`${actionPlan.pullRequestDraft.branchName}\`
Confidence: ${Math.round(actionPlan.confidence * 100)}%
Likely files:
${actionPlan.pullRequestDraft.filesChanged.map((file) => `- \`${file}\``).join("\n")}

## Summary
${actionPlan.summary}

## Suggested changes
${actionPlan.items.map((item) => `### ${item.priority} · ${item.title}
- Owner: ${item.owner}
- Rationale: ${item.rationale}
- Suggested change: ${item.suggestedChange}
- Evidence steps: ${item.evidenceStepIds.join(", ") || "report-level evidence"}
- Acceptance criteria:
${item.acceptanceCriteria.map((criterion) => `  - ${criterion}`).join("\n")}`).join("\n\n")}

## Draft PR body
${actionPlan.pullRequestDraft.body}

## Limitations
${actionPlan.pullRequestDraft.limitations.map((limitation) => `- ${limitation}`).join("\n")}`;
}

export function auditSuccessRate(audit: AuditSummary) {
  if (audit.id === demoAudit.id) {
    return demoAudit.successRate;
  }

  const cleanPasses = audit.runs.filter((run) => run.status === "SUCCEEDED").length;
  return `${cleanPasses} / ${audit.runs.length || 3} clean passes`;
}

export function auditTimeToValue(audit: AuditSummary) {
  if (audit.id === demoAudit.id) {
    return demoAudit.timeToValue;
  }

  if (audit.status === "RUNNING") {
    return "Collecting evidence";
  }

  if (audit.runs.some((run) => run.status === "TIMED_OUT")) {
    return "Timed out with partial evidence";
  }

  const firstIssueStep = audit.issues.flatMap((issue) => issue.evidenceStepIds ?? [])[0];
  if (firstIssueStep) {
    const step = audit.runs.flatMap((run) => run.steps ?? []).find((candidate) => candidate.id === firstIssueStep);
    return step ? `Step ${step.stepIndex} first blocker` : "Issue evidence captured";
  }

  return audit.completedAt ? "Run completed" : "No blocker found";
}

export function auditPreflightLabel(audit: AuditSummary) {
  if (audit.id === demoAudit.id) {
    return demoAudit.preflightLabel;
  }

  if (audit.provider === "local-playwright") {
    return audit.preflight?.isDemoTarget ? "Local Playwright demo run" : "Local Playwright safety-limited run";
  }

  if (audit.provider === "demo") {
    return "Deterministic demo fallback";
  }

  return audit.normalizedUrl ? "Safety preflight passed" : "Demo fallback";
}

function severityBreakdown(audit: AuditSummary) {
  if (!audit.issues.length) {
    return "No issues yet";
  }

  const high = audit.issues.filter((issue) => issue.severity === "HIGH" || issue.severity === "CRITICAL").length;
  const medium = audit.issues.filter((issue) => issue.severity === "MEDIUM").length;
  return `${high} high, ${medium} medium`;
}

function humanizeAction(action: string) {
  return action.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusForRun(status: RunStatus, step: BrowserStepSummary): UiStepStatus {
  if (step.status) {
    return step.status;
  }

  const lower = step.result.toLowerCase();
  if (status === "TIMED_OUT" || lower.includes("timeout") || lower.includes("timed out")) {
    return "failed";
  }
  if (lower.includes("blocked") || lower.includes("hidden") || lower.includes("duplicate") || lower.includes("invalid")) {
    return "failed";
  }
  if (status === "BLOCKED" || lower.includes("ambiguous") || lower.includes("vague")) {
    return "warning";
  }
  return "passed";
}
