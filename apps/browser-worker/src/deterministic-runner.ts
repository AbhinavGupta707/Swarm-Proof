import type { WorkerCompleteCallback, WorkerRunAgentRequest, WorkerStepCallback } from "@swarmproof/types";

export type CallbackPoster = <T>(path: "step" | "complete", body: WorkerStepCallback | WorkerCompleteCallback) => Promise<T>;

export async function runDeterministicAgent(input: WorkerRunAgentRequest, postCallback: CallbackPoster) {
  const steps = stepsFor(input);
  for (const step of steps) {
    await postCallback("step", step);
  }

  await postCallback("complete", completeFor(input, steps));
}

function stepsFor(input: WorkerRunAgentRequest): WorkerStepCallback[] {
  const mode = input.persona.mode;
  const base = input.targetUrl;

  if (input.runMode === "external-public") {
    return [
      step(
        input.auditId,
        input.runId,
        1,
        "worker_fallback",
        "Fall back after local browser execution was unavailable.",
        "The public target passed web preflight, but the local browser worker could not complete the external run.",
        base
      )
    ];
  }

  if (mode === "mobile") {
    return [
      step(input.auditId, input.runId, 1, "goto", "Open the target on a mobile viewport.", "Demo target loaded.", base),
      step(input.auditId, input.runId, 2, "click_text", "Start signup.", "Signup panel opened.", `${base}/signup`),
      step(input.auditId, input.runId, 3, "inspect_viewport", "Find primary action.", "Create account CTA is below the visible mobile fold.", `${base}/signup`)
    ];
  }

  if (mode === "chaos") {
    return [
      step(input.auditId, input.runId, 1, "goto", "Open signup quickly.", "Signup accepted demo credentials.", `${base}/signup`),
      step(input.auditId, input.runId, 2, "double_click_text", "Double-click create project.", "Two duplicate projects appeared.", `${base}/projects/new`),
      step(input.auditId, input.runId, 3, "fill_label", "Try invalid teammate email.", "Invite form produced a vague error.", `${base}/invite`)
    ];
  }

  return [
    step(input.auditId, input.runId, 1, "goto", "Open the product.", "Demo landing page loaded.", base),
    step(input.auditId, input.runId, 2, "click_text", "Create a project.", "Project creation path opened.", `${base}/projects/new`),
    step(input.auditId, input.runId, 3, "find_invite", "Find invite teammate action.", "Invite action is labeled Add people and is easy to miss.", `${base}/invite`)
  ];
}

function completeFor(input: WorkerRunAgentRequest, steps: WorkerStepCallback[]): WorkerCompleteCallback {
  const mode = input.persona.mode;
  const evidenceStepIds = steps.map((item) => `${input.runId}:${item.stepIndex}`);

  if (input.runMode === "external-public") {
    return {
      auditId: input.auditId,
      runId: input.runId,
      success: false,
      status: "BLOCKED",
      summary: "External public URL execution needs the local Playwright worker to complete successfully.",
      issues: [{
        severity: "MEDIUM",
        category: "Execution setup",
        title: "External Playwright execution did not complete",
        description: "The target passed safety preflight, but this worker fell back before it could collect live external evidence.",
        evidenceStepIds,
        suggestedFix: "Confirm BROWSER_PROVIDER=local-playwright, browser installation, and worker runtime permissions."
      }]
    };
  }

  if (mode === "mobile") {
    return {
      auditId: input.auditId,
      runId: input.runId,
      success: false,
      status: "FAILED",
      summary: "Mobile signup exposes the hidden CTA bug.",
      issues: [{
        severity: "HIGH",
        category: "Mobile UX",
        title: "Signup CTA is hidden on mobile",
        description: "The fixed-height signup panel hides the submit action below the fold.",
        evidenceStepIds,
        suggestedFix: "Move the primary action into a sticky footer or let the panel scroll."
      }]
    };
  }

  if (mode === "chaos") {
    return {
      auditId: input.auditId,
      runId: input.runId,
      success: false,
      status: "FAILED",
      summary: "Chaos input found duplicate project creation.",
      issues: [{
        severity: "MEDIUM",
        category: "Form handling",
        title: "Double submit creates duplicate projects",
        description: "The create project button stays active while the request is pending.",
        evidenceStepIds,
        suggestedFix: "Disable submit while pending and make creation idempotent."
      }]
    };
  }

  return {
    auditId: input.auditId,
    runId: input.runId,
    success: false,
    status: "BLOCKED",
    summary: "The invite teammate CTA is ambiguous.",
    issues: [{
      severity: "MEDIUM",
      category: "Information architecture",
      title: "Invite teammate CTA is hard to recognize",
      description: "The page uses Add people while the user goal is to invite a teammate.",
      evidenceStepIds,
      suggestedFix: "Rename the primary action to Invite teammate."
    }]
  };
}

function step(auditId: string, runId: string, stepIndex: number, action: string, thought: string, result: string, url: string): WorkerStepCallback {
  return { auditId, runId, stepIndex, action, thought, result, url, screenshotUrl: frameUrl(action, result) };
}

function frameUrl(action: string, result: string) {
  const text = `${action}: ${result}`.slice(0, 90);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540"><rect width="960" height="540" fill="#eef4f1"/><rect x="44" y="52" width="872" height="436" rx="16" fill="#fff" stroke="#c9d6d1"/><text x="84" y="150" font-family="Arial" font-size="28" font-weight="700" fill="#10201b">Worker evidence frame</text><text x="84" y="218" font-family="Arial" font-size="20" fill="#3f5f55">${escapeXml(text)}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char] ?? char);
}
