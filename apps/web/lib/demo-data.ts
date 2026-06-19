import type { AuditSummary } from "@swarmproof/types";
import { Events } from "@swarmproof/events";
import { buildPlaywrightTest } from "@swarmproof/testgen";

type StepStatus = "passed" | "warning" | "failed";

export type DemoStep = {
  id: string;
  runId: string;
  time: string;
  label: string;
  result: string;
  status: StepStatus;
  evidence: string;
  url: string;
};

export type DemoEvidenceFrame = {
  id: string;
  runId: string;
  step: string;
  title: string;
  viewport: string;
  state: string;
  finding: string;
};

export type DemoNovusEvent = {
  name: string;
  count: number;
  safeProps: string[];
};

export const demoAudit: AuditSummary & {
  startedAt: string;
  completedAt: string;
  result: "Partial pass";
  successRate: string;
  timeToValue: string;
  preflight: string;
  metrics: Array<{ label: string; value: string; detail: string }>;
  steps: DemoStep[];
  evidenceFrames: DemoEvidenceFrame[];
  suggestedFixes: Array<{ title: string; owner: string; impact: string }>;
  bugReport: string;
  novusEvents: DemoNovusEvent[];
} = {
  id: "demo",
  targetUrl: "/demo-target",
  goal: "Sign up, create a project, invite a teammate.",
  status: "COMPLETED",
  score: 72,
  shareToken: "demo-share",
  startedAt: "2026-06-19 10:42 BST",
  completedAt: "2026-06-19 10:44 BST",
  result: "Partial pass",
  successRate: "0 / 3 clean passes",
  timeToValue: "2m 08s to first blocker",
  preflight: "Public route, no credentials, deterministic demo runner",
  metrics: [
    { label: "Personas", value: "3", detail: "Normal, mobile, chaos" },
    { label: "Evidence frames", value: "9", detail: "Screenshot-style states captured" },
    { label: "Issues found", value: "4", detail: "2 high, 2 medium" },
    { label: "Safe events", value: "28", detail: "No raw page content or secrets" }
  ],
  runs: [
    {
      id: "normal-demo",
      persona: "Normal user",
      mode: "normal",
      status: "BLOCKED",
      summary: "Reached the team screen, then stalled because the invite action is labeled Add people and sits under a People heading."
    },
    {
      id: "mobile-demo",
      persona: "Mobile user",
      mode: "mobile",
      status: "FAILED",
      summary: "Could not complete signup at 390px wide because the primary create-account action falls below the clipped panel."
    },
    {
      id: "chaos-demo",
      persona: "Chaos user",
      mode: "chaos",
      status: "FAILED",
      summary: "Double-clicked project creation and produced duplicate project states before hitting a vague invite error."
    }
  ],
  issues: [
    {
      id: "issue-mobile-cta",
      severity: "HIGH",
      category: "Mobile UX",
      title: "Signup CTA is hidden on mobile",
      description: "The fixed-height signup panel hides the submit action below the fold on small screens.",
      suggestedFix: "Let the modal content scroll or move the primary action into a sticky footer."
    },
    {
      id: "issue-invite-language",
      severity: "MEDIUM",
      category: "Information architecture",
      title: "Invite action is hard to recognize",
      description: "The goal asks users to invite a teammate, but the target screen exposes the action as Add people under a generic People label.",
      suggestedFix: "Use the task language directly: Invite teammate. Keep the action visible next to the team email field."
    },
    {
      id: "issue-duplicate-project",
      severity: "MEDIUM",
      category: "Form handling",
      title: "Double submit creates duplicate projects",
      description: "The create project button remains active while the request is pending.",
      suggestedFix: "Disable the submit button after first click and make creation idempotent."
    },
    {
      id: "issue-invalid-email",
      severity: "HIGH",
      category: "Validation",
      title: "Invalid invite email reaches a dead-end error",
      description: "The invite form accepts an invalid email string and then responds with a generic failure message instead of inline validation.",
      suggestedFix: "Validate email before submit and show a field-level message that explains the expected format."
    }
  ],
  steps: [
    {
      id: "step-1",
      runId: "normal-demo",
      time: "00:04",
      label: "Opened demo SaaS target",
      result: "Landing page rendered with a visible Get started action.",
      status: "passed",
      evidence: "Desktop hero and product workspace preview",
      url: "/demo-target"
    },
    {
      id: "step-2",
      runId: "normal-demo",
      time: "00:24",
      label: "Created account",
      result: "Signup completed on desktop and moved to project creation.",
      status: "passed",
      evidence: "Email and password fields accepted",
      url: "/demo-target/signup"
    },
    {
      id: "step-3",
      runId: "normal-demo",
      time: "01:18",
      label: "Searched for invite teammate",
      result: "Agent reached People screen but could not map Add people to the requested invite task.",
      status: "warning",
      evidence: "Ambiguous People screen",
      url: "/demo-target/invite"
    },
    {
      id: "step-4",
      runId: "mobile-demo",
      time: "00:37",
      label: "Attempted mobile signup",
      result: "Primary action was below the clipped viewport, blocking completion.",
      status: "failed",
      evidence: "390px signup panel crop",
      url: "/demo-target/signup"
    },
    {
      id: "step-5",
      runId: "chaos-demo",
      time: "01:02",
      label: "Double-clicked create project",
      result: "Two project states were created because the primary action remained active.",
      status: "failed",
      evidence: "Duplicate project records",
      url: "/demo-target/projects/new"
    },
    {
      id: "step-6",
      runId: "chaos-demo",
      time: "01:46",
      label: "Submitted invalid invite email",
      result: "The form accepted not-an-email, then displayed a generic error.",
      status: "failed",
      evidence: "Dead-end invite message",
      url: "/demo-target/invite"
    }
  ],
  evidenceFrames: [
    {
      id: "frame-normal-1",
      runId: "normal-demo",
      step: "00:04",
      title: "Landing state",
      viewport: "1440 x 900",
      state: "Get started CTA visible",
      finding: "Entry point is clear on desktop."
    },
    {
      id: "frame-normal-2",
      runId: "normal-demo",
      step: "01:18",
      title: "Invite confusion",
      viewport: "1440 x 900",
      state: "People screen with Add people action",
      finding: "Task wording mismatch delayed the normal persona."
    },
    {
      id: "frame-mobile-1",
      runId: "mobile-demo",
      step: "00:37",
      title: "Mobile signup crop",
      viewport: "390 x 844",
      state: "Primary action below clipped panel",
      finding: "Mobile persona cannot proceed without hidden scrolling behavior."
    },
    {
      id: "frame-chaos-1",
      runId: "chaos-demo",
      step: "01:02",
      title: "Duplicate project",
      viewport: "1366 x 768",
      state: "Repeated create action accepted",
      finding: "No pending state or idempotency guard."
    },
    {
      id: "frame-chaos-2",
      runId: "chaos-demo",
      step: "01:46",
      title: "Invalid invite",
      viewport: "1366 x 768",
      state: "not-an-email accepted",
      finding: "Validation happens too late and gives no recovery path."
    }
  ],
  suggestedFixes: [
    { title: "Make signup actions reachable on mobile", owner: "Frontend", impact: "Unblocks first-run activation on small screens." },
    { title: "Rename Add people to Invite teammate", owner: "Product", impact: "Aligns UI language with user intent and support docs." },
    { title: "Guard project creation against duplicate submits", owner: "Engineering", impact: "Prevents duplicate records and noisy analytics." },
    { title: "Add inline invite email validation", owner: "Frontend", impact: "Turns a dead end into a recoverable form state." }
  ],
  generatedTest: buildPlaywrightTest({
    name: "demo signup project invite smoke",
    targetUrl: "/demo-target",
    goal: "Sign up, create a project, invite a teammate"
  }),
  bugReport: `## Bug: Mobile signup CTA is unreachable

Severity: High
Route: /demo-target/signup
Evidence: Mobile persona at 390 x 844 could not reach the Create account action because the panel clips content.

Expected: A first-time user can create an account on mobile without discovering hidden scroll behavior.
Actual: The primary action is below the visible panel and the flow stalls.

Suggested fix: Make the panel scrollable or pin the primary action in a visible footer.`,
  novusEvents: [
    { name: Events.UrlSubmitted, count: 1, safeProps: ["mode", "target_kind", "persona_count"] },
    { name: Events.AgentRunStarted, count: 3, safeProps: ["audit_id", "persona_mode", "max_steps"] },
    { name: Events.BrowserStepCompleted, count: 18, safeProps: ["audit_id", "persona_mode", "step_index", "status"] },
    { name: Events.IssueDetected, count: 4, safeProps: ["audit_id", "severity", "category"] },
    { name: Events.ReportGenerated, count: 1, safeProps: ["audit_id", "score", "issue_count"] },
    { name: Events.ShareCreated, count: 1, safeProps: ["audit_id", "public_report"] }
  ]
};
