import type { AuditSummary } from "@swarmproof/types";
import { buildPlaywrightTest } from "@swarmproof/testgen";

export const demoAudit: AuditSummary = {
  id: "demo",
  targetUrl: "/demo-target",
  goal: "Sign up, create a project, invite a teammate.",
  status: "COMPLETED",
  score: 72,
  shareToken: "demo-share",
  runs: [
    {
      id: "normal-demo",
      persona: "Normal user",
      mode: "normal",
      status: "BLOCKED",
      summary: "Reached invite flow but missed the teammate CTA because it is labeled Add people."
    },
    {
      id: "mobile-demo",
      persona: "Mobile user",
      mode: "mobile",
      status: "FAILED",
      summary: "Signup modal CTA falls below the visible mobile viewport."
    },
    {
      id: "chaos-demo",
      persona: "Chaos user",
      mode: "chaos",
      status: "FAILED",
      summary: "Double-clicking project creation created duplicate project cards."
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
      id: "issue-duplicate-project",
      severity: "MEDIUM",
      category: "Form handling",
      title: "Double submit creates duplicate projects",
      description: "The create project button remains active while the request is pending.",
      suggestedFix: "Disable the submit button after first click and make creation idempotent."
    }
  ],
  generatedTest: buildPlaywrightTest({
    name: "demo signup project invite smoke",
    targetUrl: "/demo-target",
    goal: "Sign up, create a project, invite a teammate"
  })
};
