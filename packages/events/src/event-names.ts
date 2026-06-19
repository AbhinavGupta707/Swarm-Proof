export const Events = {
  AuditCreated: "audit_created",
  UrlSubmitted: "url_submitted",
  PreflightStarted: "preflight_started",
  PreflightCompleted: "preflight_completed",
  AgentRunStarted: "agent_run_started",
  BrowserStepCompleted: "browser_step_completed",
  PersonaBlocked: "persona_blocked",
  PersonaFailed: "persona_failed",
  PersonaTimedOut: "persona_timed_out",
  IssueDetected: "issue_detected",
  RunCompleted: "run_completed",
  ReportGenerated: "report_generated",
  ReplayOpened: "replay_opened",
  TestExported: "test_exported",
  BugReportDownloaded: "bug_report_downloaded",
  ShareCreated: "share_created"
} as const;

export type EventName = (typeof Events)[keyof typeof Events];
