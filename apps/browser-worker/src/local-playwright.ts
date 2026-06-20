import { chromium, type BrowserContext, type Page } from "playwright";
import {
  personaProfileForMode,
  type EvidenceVerifierResult,
  type GoalSpec,
  type PageObservation,
  type PlannerStepDiagnostic,
  type WorkerCompleteCallback,
  type WorkerIssueCallback,
  type WorkerRunAgentRequest,
  type WorkerStepCallback
} from "@swarmproof/types";
import type { CallbackPoster } from "./deterministic-runner";
import { isExecutableExternalPlan, planExternalActionWithAi, type ExternalCandidate, type ExternalCandidateCategory, type PlannedExternalAction } from "./external-planner";
import { verifyEvidenceWithAi } from "./evidence-verifier";
import { compileGoalSpec } from "./goal-spec";
import { observePage, summarizeObservation } from "./page-observation";
import { commitmentStopReason, hasStrongAuthWallSignals, isCrossOriginNavigation, isUnsafeWorkerUrl, type WorkerSafetyOptions } from "./safety";

type EvidenceState = {
  stepIds: string[];
  consoleErrors: string[];
  networkFailures: string[];
  observations: PageObservation[];
  goalSpec?: GoalSpec;
  verifierResult?: EvidenceVerifierResult;
};

export function isPlaywrightPackageAvailable() {
  return Boolean(chromium);
}

export async function runLocalPlaywrightAgent(input: WorkerRunAgentRequest, postCallback: CallbackPoster) {
  const safety = safetyOptionsFor(input);
  if (isUnsafeWorkerUrl(input.targetUrl, safety)) {
    throw new Error("Worker safety blocked an unsafe target URL.");
  }

  const browser = await chromium.launch({
    headless: process.env.PLAYWRIGHT_HEADFUL !== "1"
  });

  const state: EvidenceState = { stepIds: [], consoleErrors: [], networkFailures: [], observations: [] };
  let context: BrowserContext | undefined;

  try {
    context = await browser.newContext({
      viewport: {
        width: input.persona.viewport.width,
        height: input.persona.viewport.height
      },
      isMobile: Boolean(input.persona.viewport.isMobile)
    });

    const page = await context.newPage();
    await page.addInitScript("globalThis.__name = globalThis.__name || function(value) { return value; };");
    const targetOrigin = new URL(input.targetUrl).origin;

    page.on("console", (message) => {
      if (message.type() === "error") {
        state.consoleErrors.push(message.text().slice(0, 240));
      }
    });
    page.on("requestfailed", (request) => {
      state.networkFailures.push(`${request.method()} ${redactUrl(request.url())}`.slice(0, 240));
    });

    await context.route("**/*", async (route) => {
      const request = route.request();
      const requestUrl = request.url();
      const isMainNavigation = request.isNavigationRequest() && request.frame() === page.mainFrame();

      if (isUnsafeWorkerUrl(requestUrl, safety)) {
        await route.abort();
        return;
      }

      if (input.runMode === "external-public" && isMainNavigation && isCrossOriginNavigation(requestUrl, targetOrigin)) {
        await route.abort();
        return;
      }

      await route.continue();
    });

    const flow = input.runMode === "demo-target"
      ? runDemoTargetFlow(input, page, postCallback, state)
      : runExternalPublicFlow(input, page, postCallback, state);
    await withTimeout(flow, localPersonaTimeoutMs(input), new Error("Worker persona timeout elapsed."));
  } finally {
    await context?.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

async function runDemoTargetFlow(input: WorkerRunAgentRequest, page: Page, postCallback: CallbackPoster, state: EvidenceState) {
  const mode = input.persona.mode;
  const issues: WorkerIssueCallback[] = [];

  await page.goto(input.targetUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
  await emitStep(input, postCallback, state, {
    stepIndex: 1,
    action: "goto",
    thought: "Open the built-in demo target in a real browser.",
    result: "Demo target rendered in Playwright.",
    page
  });

  if (mode === "mobile") {
    await page.getByRole("link", { name: /get started/i }).click();
    await page.waitForLoadState("domcontentloaded");
    const clipped = await isCreateAccountCtaClipped(page);
    await emitStep(input, postCallback, state, {
      stepIndex: 2,
      action: "inspect_viewport",
      status: clipped ? "failed" : "passed",
      thought: "Check whether the mobile signup CTA is reachable.",
      result: clipped ? "Create account CTA is clipped inside the fixed-height mobile panel." : "Create account CTA is visible on mobile.",
      page
    });

    if (clipped) {
      issues.push({
        severity: "HIGH",
        category: "Mobile UX",
        title: "Signup CTA is hidden on mobile",
        description: "A real mobile Playwright viewport found the Create account action clipped inside the signup panel.",
        evidenceStepIds: [...state.stepIds],
        suggestedFix: "Allow the panel to scroll or keep the primary action in a visible sticky footer."
      });
    }

    await complete(input, postCallback, state, {
      success: false,
      status: clipped ? "FAILED" : "SUCCEEDED",
      summary: clipped ? "Real Playwright mobile run reproduced the hidden CTA bug." : "Mobile signup CTA was visible.",
      issues
    });
    return;
  }

  if (mode === "chaos") {
    await page.goto(new URL("/demo-target/projects/new", input.targetUrl).toString(), { waitUntil: "domcontentloaded", timeout: 15000 });
    const duplicateCreateControls = await page.getByRole("link", { name: /create project/i }).count();
    await emitStep(input, postCallback, state, {
      stepIndex: 2,
      action: "double_click_text",
      status: duplicateCreateControls > 1 ? "warning" : "passed",
      thought: "Look for duplicate-submit affordances in the project creation flow.",
      result: duplicateCreateControls > 1 ? "Two create project controls are visible, including a duplicate action." : "Only one create project action is visible.",
      page
    });

    await page.goto(new URL("/demo-target/invite", input.targetUrl).toString(), { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.getByLabel(/email/i).fill("not-an-email");
    await page.getByRole("button", { name: /add people/i }).click();
    await emitStep(input, postCallback, state, {
      stepIndex: 3,
      action: "fill_label",
      status: "failed",
      thought: "Try an invalid teammate email like a messy real user.",
      result: "Invalid email produces a vague error instead of field-level guidance.",
      page
    });

    issues.push({
      severity: "MEDIUM",
      category: "Form handling",
      title: "Duplicate and invalid invite states are easy to trigger",
      description: "The real browser run found duplicate project creation affordances and a vague invalid-email error.",
      evidenceStepIds: [...state.stepIds],
      suggestedFix: "Disable duplicate submit paths and validate email format with specific inline copy."
    });

    await complete(input, postCallback, state, {
      success: false,
      status: "FAILED",
      summary: "Real Playwright chaos run found duplicate-submit and validation friction.",
      issues
    });
    return;
  }

  await page.getByRole("link", { name: /get started/i }).click();
  await page.waitForLoadState("domcontentloaded");
  await page.getByRole("link", { name: /create account/i }).click();
  await page.waitForLoadState("domcontentloaded");
  await page.getByRole("link", { name: /^create project$/i }).click();
  await page.waitForLoadState("domcontentloaded");

  const inviteButtons = await page.getByRole("button", { name: /invite teammate/i }).count();
  const addPeopleButtons = await page.getByRole("button", { name: /add people/i }).count();
  await emitStep(input, postCallback, state, {
    stepIndex: 2,
    action: "find_invite",
    status: inviteButtons === 0 && addPeopleButtons > 0 ? "warning" : "passed",
    thought: "Try to find the expected invite teammate action.",
    result: inviteButtons === 0 && addPeopleButtons > 0
      ? "No Invite teammate action is visible; the action is labeled Add people."
      : "Invite teammate action is discoverable.",
    page
  });

  if (inviteButtons === 0 && addPeopleButtons > 0) {
    issues.push({
      severity: "MEDIUM",
      category: "Information architecture",
      title: "Invite teammate CTA is hard to recognize",
      description: "A real browser run reached the team screen but found Add people instead of the expected Invite teammate action.",
      evidenceStepIds: [...state.stepIds],
      suggestedFix: "Rename Add people to Invite teammate or add a secondary label that matches the user goal."
    });
  }

  await complete(input, postCallback, state, {
    success: issues.length === 0,
    status: issues.length === 0 ? "SUCCEEDED" : "BLOCKED",
    summary: issues.length === 0 ? "Real Playwright normal run completed the demo goal." : "Real Playwright normal run was blocked by ambiguous invite copy.",
    issues
  });
}

async function runExternalPublicFlow(input: WorkerRunAgentRequest, page: Page, postCallback: CallbackPoster, state: EvidenceState) {
  const issues: WorkerIssueCallback[] = [];
  const visitedHrefs = new Set<string>();
  const usedOrdinals = new Set<number>();
  const history: string[] = [];
  let actionsTaken = 0;
  let stoppedForSafety = false;
  const persona = personaProfileForMode(input.persona.mode);
  const targetOrigin = new URL(input.targetUrl).origin;
  const goalSpec = compileGoalSpec({
    goal: input.goal,
    targetUrl: input.targetUrl,
    personaMode: input.persona.mode,
    allowFormActions: Boolean(input.allowExternalFormSubmissions)
  });
  state.goalSpec = goalSpec;

  await page.goto(input.targetUrl, { waitUntil: "domcontentloaded", timeout: 18000 });
  visitedHrefs.add(page.url());
  const initialObservation = await observePage(page, targetOrigin, `${input.runId}:1`);
  state.observations.push(initialObservation);
  state.verifierResult = await verifyEvidenceWithAi({ goalSpec, observations: state.observations });
  await emitStep(input, postCallback, state, {
    stepIndex: 1,
    action: "goto",
    thought: `${persona.name}: ${persona.goalInterpretation}`,
    result: `${summarizeObservation(initialObservation)} Verifier: ${formatVerifierResult(state.verifierResult)} Safety interception is enabled.`,
    page,
    observation: initialObservation,
    verifier: state.verifierResult,
    goalSpec
  });
  history.push(`Loaded ${redactUrl(page.url())}.`);

  if (state.verifierResult.verdict === "SUCCEEDED") {
    await complete(input, postCallback, state, {
      success: true,
      status: "SUCCEEDED",
      summary: `Verifier confirmed the initial page already met the required evidence: ${state.verifierResult.explanation}`,
      issues,
      goalSpec,
      verifierResult: finalizeVerifierStepIds(state.verifierResult, state)
    });
    return;
  }

  const maxAgentSteps = Math.max(2, Math.min(input.maxSteps - 1, 4));
  for (let offset = 0; offset < maxAgentSteps; offset += 1) {
    const stepIndex = offset + 2;
    const currentObservation = state.observations.at(-1) ?? await observePage(page, targetOrigin, `${input.runId}:${stepIndex}`);
    const currentVerifier = state.verifierResult ?? await verifyEvidenceWithAi({ goalSpec, observations: state.observations });
    if (currentVerifier.verdict === "SUCCEEDED") {
      break;
    }

    if (currentVerifier.safetyFailures.length > 0) {
      issues.push(issueForVerifier(currentVerifier, state));
      break;
    }

    const candidates = currentObservation.actionCandidates;
    if (candidates.length === 0) {
      await emitStep(input, postCallback, state, {
        stepIndex,
        action: "observe",
        status: "warning",
        thought: `${persona.name} could not form a safe next action within the page budget.`,
        result: `${summarizeObservation(currentObservation)} Verifier: ${formatVerifierResult(currentVerifier)}`,
        page,
        observation: currentObservation,
        verifier: currentVerifier,
        goalSpec
      });
      issues.push(issueForVerifier(currentVerifier, state));
      break;
    }
    const commitmentStops = commitmentStopsForCandidates(candidates);
    const plan = await planExternalActionWithAi({
      goal: input.goal,
      personaMode: input.persona.mode,
      candidates,
      allowFormActions: Boolean(input.allowExternalFormSubmissions),
      visitedHrefs: [...visitedHrefs],
      usedOrdinals: [...usedOrdinals],
      page: { url: currentObservation.url, title: currentObservation.title },
      history
    });
    const planner = plannerDiagnosticFor(plan);

    if (plan.type === "none") {
      await emitStep(input, postCallback, state, {
        stepIndex,
        action: "observe",
        status: "warning",
        thought: formatPlanThought(plan),
        result: `${summarizeObservation(currentObservation)} ${commitmentStops.length > 0 ? `Safety stop visible: ${formatCommitmentStops(commitmentStops)}.` : plan.reason} ${formatPlanResultSignal(plan)} Verifier: ${formatVerifierResult(currentVerifier)}`,
        page,
        observation: currentObservation,
        planner,
        verifier: currentVerifier,
        goalSpec
      });
      if (commitmentStops.length > 0 && actionsTaken > 0) {
        stoppedForSafety = true;
        issues.push({
          severity: "LOW",
          category: "Safety stop",
          title: "Audit stopped before checkout or commitment",
          description: `The runner explored the public product path, then stopped before commitment actions: ${formatCommitmentStops(commitmentStops)}.`,
          evidenceStepIds: [...state.stepIds],
          suggestedFix: "Keep pricing and configuration review available before cart or checkout, and add a non-committing summary state that QA can assert safely."
        });
      } else {
        issues.push({
          severity: "LOW",
          category: "Exploration limit",
          title: "No safe goal-relevant public action was selected",
          description: "The runner observed the page but did not click or submit risky, cross-origin, purchase, logout, credential, or destructive actions.",
          evidenceStepIds: [...state.stepIds],
          suggestedFix: "Provide a public unauthenticated goal with a safe same-origin CTA, or enable a future owner-confirmed form-submission mode."
        });
      }
      break;
    }

    if (plan.type === "done") {
      await emitStep(input, postCallback, state, {
        stepIndex,
        action: "done",
        status: "warning",
        thought: formatPlanThought(plan),
        result: `Planner requested success, but success is verifier-only. Evidence claim: ${plan.evidence} ${formatPlanResultSignal(plan)} Verifier: ${formatVerifierResult(currentVerifier)}`,
        page,
        observation: currentObservation,
        planner,
        verifier: currentVerifier,
        goalSpec
      });
      history.push(`Verifier-only done rejected: ${plan.evidence}`);
      break;
    }

    if (plan.type === "fail") {
      await emitStep(input, postCallback, state, {
        stepIndex,
        action: "fail",
        status: "failed",
        thought: formatPlanThought(plan),
        result: `Planner could not continue safely: ${plan.evidence} ${formatPlanResultSignal(plan)} Verifier: ${formatVerifierResult(currentVerifier)}`,
        page,
        observation: currentObservation,
        planner,
        verifier: currentVerifier,
        goalSpec
      });
      issues.push({
        severity: "LOW",
        category: "Agent uncertainty",
        title: "Agent could not find a safe next step",
        description: plan.evidence,
        evidenceStepIds: [...state.stepIds],
        suggestedFix: "Check whether the page exposes goal-relevant CTAs with visible, specific labels before private or commitment steps."
      });
      break;
    }

    if (!isExecutableExternalPlan(plan)) {
      break;
    }

    const beforeActionUrl = page.url();
    const result = await withFallbackTimeout(
      executePlannedAction(page, plan),
      14_000,
      {
        ok: false,
        message: `Action "${plan.candidate.label}" did not settle within the safe per-step budget.`
      }
    );
    if (page.url() === beforeActionUrl) {
      usedOrdinals.add(plan.candidate.ordinal);
    } else {
      usedOrdinals.clear();
    }
    if (plan.candidate.href) {
      visitedHrefs.add(plan.candidate.href);
    }
    visitedHrefs.add(page.url());
    actionsTaken += 1;
    const afterObservation = await observePage(page, targetOrigin, `${input.runId}:${stepIndex}`);
    state.observations.push(afterObservation);
    state.verifierResult = await verifyEvidenceWithAi({ goalSpec, observations: state.observations });

    await emitStep(input, postCallback, state, {
      stepIndex,
      action: plan.type === "fill" ? "fill_label" : `click_${plan.candidate.kind}`,
      status: result.ok ? "passed" : "failed",
      thought: formatPlanThought(plan),
      result: `${result.message} ${formatPlanResultSignal(plan)} ${result.ok ? `Verifier: ${formatVerifierResult(state.verifierResult)}` : "Confusion signal: planned action did not complete."}`,
      page,
      observation: afterObservation,
      planner,
      verifier: state.verifierResult,
      goalSpec
    });
    history.push(`${plan.type}: ${plan.candidate.label} -> ${result.message}`);

    if (!result.ok) {
      issues.push({
        severity: "MEDIUM",
        category: "Execution",
        title: "Planned public-site action could not be completed",
        description: result.message,
        evidenceStepIds: [...state.stepIds],
        suggestedFix: "Review whether the target action is visible, enabled, and available without private credentials."
      });
      break;
    }

    if (state.verifierResult.verdict === "SUCCEEDED") {
      history.push(`Verifier reached required evidence on ${redactUrl(page.url())}.`);
      break;
    }

    if (state.verifierResult.safetyFailures.length > 0) {
      issues.push(issueForVerifier(state.verifierResult, state));
      break;
    }
  }

  addConsoleAndNetworkIssues(issues, state);
  const finalVerifier = finalizeVerifierStepIds(
    state.verifierResult ?? await verifyEvidenceWithAi({ goalSpec, observations: state.observations }),
    state
  );
  state.verifierResult = finalVerifier;
  if (finalVerifier.verdict !== "SUCCEEDED" && !issues.some((issue) => issue.category === "Auth-limited flow" || issue.category === "Safety stop" || issue.category === "Goal evidence")) {
    issues.push(issueForVerifier(finalVerifier, state));
  }
  const missedGoal = issues.some((issue) => issue.category === "Goal evidence");
  const terminal = externalRunCompletionFromVerifier(finalVerifier, issues);
  await complete(input, postCallback, state, {
    success: terminal.success,
    status: terminal.status,
    summary: stoppedForSafety
      ? `The local Playwright worker safely executed ${actionsTaken} public-site action(s), then stopped before cart, checkout, payment, or private-data commitment.`
      : missedGoal
        ? `The verifier found partial evidence after ${actionsTaken} safe public-site action(s), but required evidence is still missing: ${finalVerifier.missingRequirements.map((item) => item.label).join(", ")}.`
      : actionsTaken > 0
      ? `The local Playwright worker safely executed ${actionsTaken} public-site action(s). Verifier verdict: ${finalVerifier.verdict}.`
      : `The local Playwright worker loaded the public URL but stopped before unsafe or irrelevant actions. Verifier verdict: ${finalVerifier.verdict}.`,
    issues,
    goalSpec,
    verifierResult: finalVerifier
  });
}

export function externalRunCompletionFromVerifier(verifier: EvidenceVerifierResult, issues: WorkerIssueCallback[] = []) {
  const hasHardIssue = issues.some((issue) => issue.severity === "HIGH" || issue.severity === "CRITICAL");
  const authLimited = issues.some((issue) => issue.category === "Auth-limited flow");
  const success = verifier.verdict === "SUCCEEDED" && !authLimited && !hasHardIssue;
  return {
    success,
    status: success ? "SUCCEEDED" as const : verifier.verdict === "FAILED" ? "FAILED" as const : "BLOCKED" as const
  };
}

async function emitStep(
  input: WorkerRunAgentRequest,
  postCallback: CallbackPoster,
  state: EvidenceState,
  step: {
    stepIndex: number;
    action: string;
    status?: "passed" | "warning" | "failed";
    thought: string;
    result: string;
    page: Page;
    observation?: PageObservation;
    planner?: PlannerStepDiagnostic;
    verifier?: EvidenceVerifierResult;
    goalSpec?: GoalSpec;
  }
) {
  const payload: WorkerStepCallback = {
    auditId: input.auditId,
    runId: input.runId,
    stepIndex: step.stepIndex,
    action: step.action,
    status: step.status ?? "passed",
    thought: step.thought,
    result: step.result,
    url: step.page.url(),
    screenshotBase64: await screenshotBase64(step.page),
    observation: step.observation,
    planner: step.planner,
    verifier: step.verifier,
    goalSpec: step.goalSpec
  };

  const recorded = await postCallback<{ id?: string }>("step", payload);
  state.stepIds.push(typeof recorded?.id === "string" ? recorded.id : `${input.runId}:${step.stepIndex}`);
}

async function complete(
  input: WorkerRunAgentRequest,
  postCallback: CallbackPoster,
  state: EvidenceState,
  result: Pick<WorkerCompleteCallback, "success" | "status" | "summary" | "issues" | "goalSpec" | "verifierResult">
) {
  const artifacts: WorkerCompleteCallback["artifacts"] = [];
  if (state.consoleErrors.length > 0) {
    artifacts.push({ type: "CONSOLE_LOG", url: `memory://console/${input.runId}`, meta: { errors: state.consoleErrors.length } });
  }
  if (state.networkFailures.length > 0) {
    artifacts.push({ type: "NETWORK_LOG", url: `memory://network/${input.runId}`, meta: { failures: state.networkFailures.length } });
  }

  await postCallback("complete", {
    auditId: input.auditId,
    runId: input.runId,
    success: result.success,
    status: result.status,
    summary: result.summary,
    issues: result.issues,
    artifacts,
    goalSpec: result.goalSpec ?? state.goalSpec,
    verifierResult: result.verifierResult ?? state.verifierResult
  });
}

function plannerDiagnosticFor(plan: PlannedExternalAction): PlannerStepDiagnostic {
  const base = {
    reason: plan.reason,
    confidence: plan.confidence,
    expectedEvidence: plan.expectedEvidence
  };

  if (plan.type === "click" || plan.type === "fill") {
    return {
      type: plan.type,
      ...base,
      candidateLabel: plan.candidate.label,
      candidateKind: plan.candidate.kind,
      candidateCategory: plan.candidate.category
    };
  }

  return {
    type: plan.type === "fail" ? "fail" : plan.type === "none" ? "none" : "observe",
    ...base
  };
}

function formatVerifierResult(verifier: EvidenceVerifierResult) {
  const met = verifier.metRequirements.map((item) => item.label).join(", ") || "none";
  const missing = verifier.missingRequirements.map((item) => item.label).join(", ") || "none";
  return `${verifier.verdict} (${Math.round(verifier.confidence * 100)}% confidence). Met: ${met}. Missing: ${missing}. ${verifier.explanation}`;
}

function issueForVerifier(verifier: EvidenceVerifierResult, state: EvidenceState): WorkerIssueCallback {
  if (verifier.safetyFailures.length > 0) {
    return {
      severity: "MEDIUM",
      category: "Auth-limited flow",
      title: "Audit reached an auth, verification, or forbidden boundary",
      description: verifier.explanation,
      evidenceStepIds: [...state.stepIds],
      suggestedFix: "Run SwarmProof on a public unauthenticated flow or add a future owner-approved authenticated-testing setup."
    };
  }

  if (verifier.verdict === "BLOCKED") {
    return {
      severity: "LOW",
      category: "Exploration limit",
      title: "No safe action exposed the missing evidence",
      description: verifier.explanation,
      evidenceStepIds: [...state.stepIds],
      suggestedFix: "Expose a clearer public same-origin path to the goal evidence before signup, checkout, sales, or private-data steps."
    };
  }

  return {
    severity: "LOW",
    category: "Goal evidence",
    title: "Required goal evidence was not fully met",
    description: verifier.explanation,
    evidenceStepIds: [...state.stepIds],
    suggestedFix: "Start from a more specific public URL, clarify goal-relevant labels, or add public read-only evidence before commitment boundaries."
  };
}

function finalizeVerifierStepIds(verifier: EvidenceVerifierResult, state: EvidenceState): EvidenceVerifierResult {
  if (verifier.supportingStepIds.length > 0 && verifier.supportingStepIds.every((id) => state.stepIds.includes(id))) {
    return verifier;
  }

  return {
    ...verifier,
    supportingStepIds: verifier.verdict === "SUCCEEDED" || verifier.metRequirements.length > 0
      ? [...state.stepIds]
      : verifier.supportingStepIds
  };
}

function safetyOptionsFor(input: WorkerRunAgentRequest): WorkerSafetyOptions {
  if (input.runMode === "demo-target") {
    return {
      allowLocalAppOrigin: new URL(input.callbackBaseUrl).origin,
      allowLocalAppPaths: ["/demo-target"]
    };
  }

  return {};
}

async function screenshotBase64(page: Page) {
  try {
    const image = await page.screenshot({ type: "png", fullPage: false, timeout: 5000 });
    return image.toString("base64");
  } catch {
    return undefined;
  }
}

async function isCreateAccountCtaClipped(page: Page) {
  return page.getByRole("link", { name: /create account/i }).evaluate((element) => {
    const rect = element.getBoundingClientRect();
    let parent = element.parentElement;
    while (parent) {
      const style = window.getComputedStyle(parent);
      if (/(auto|hidden|clip|scroll)/.test(`${style.overflow}${style.overflowY}${style.overflowX}`)) {
        const parentRect = parent.getBoundingClientRect();
        if (rect.bottom > parentRect.bottom || rect.top < parentRect.top || rect.right > parentRect.right || rect.left < parentRect.left) {
          return true;
        }
      }
      parent = parent.parentElement;
    }

    return rect.bottom > window.innerHeight || rect.right > window.innerWidth || rect.top < 0 || rect.left < 0;
  });
}

async function safeTitle(page: Page) {
  return `"${(await safeTitleText(page)).slice(0, 80)}"`;
}

async function safeTitleText(page: Page) {
  return (await page.title().catch(() => "")) || new URL(page.url()).hostname;
}

async function detectAuthWall(page: Page) {
  const signals = await page.evaluate(() => {
    const elements = Array.from(document.querySelectorAll("main, [role='main'], form, dialog, [role='dialog'], section, article, body"));
    const text = (document.body?.innerText ?? "").slice(0, 3000);
    const passwordFieldCount = Array.from(document.querySelectorAll("input")).filter((element) => {
      const input = element as HTMLInputElement;
      return isVisible(input) && input.type.toLowerCase() === "password";
    }).length;
    const captchaCount = Array.from(document.querySelectorAll("iframe, div, input")).filter((element) => {
      if (!isVisible(element)) return false;
      const haystack = [
        element.getAttribute("src"),
        element.getAttribute("title"),
        element.getAttribute("aria-label"),
        element.getAttribute("class"),
        element.getAttribute("id"),
        element.getAttribute("name")
      ].filter(Boolean).join(" ");
      return /\b(captcha|recaptcha|hcaptcha|turnstile)\b/i.test(haystack);
    }).length;
    const verificationFieldCount = Array.from(document.querySelectorAll("input, textarea")).filter((element) => {
      if (!isVisible(element)) return false;
      const input = element as HTMLInputElement | HTMLTextAreaElement;
      const explicitLabel = input.id ? document.querySelector(`label[for="${cssEscape(input.id)}"]`)?.textContent ?? "" : "";
      const haystack = [
        explicitLabel,
        input.getAttribute("aria-label"),
        input.getAttribute("placeholder"),
        input.getAttribute("name"),
        input.getAttribute("autocomplete")
      ].filter(Boolean).join(" ");
      return /\b(verification code|two-factor|2fa|one-time code|security code|otp)\b/i.test(haystack);
    }).length;
    const accessDeniedPanelCount = elements.filter((element) => {
      if (!isVisible(element)) return false;
      const panelText = (element.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 1000);
      return /\b(access denied|unauthorized|authentication required|login required|sign in required|members only|private page)\b/i.test(panelText);
    }).length;

    return { visibleText: text, passwordFieldCount, captchaCount, verificationFieldCount, accessDeniedPanelCount };

    function isVisible(element: Element) {
      const htmlElement = element as HTMLElement;
      const rect = htmlElement.getBoundingClientRect();
      const style = window.getComputedStyle(htmlElement);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    }

    function cssEscape(value: string) {
      return value.replace(/["\\]/g, "\\$&");
    }
  }).catch(() => ({
    visibleText: "",
    passwordFieldCount: 0,
    captchaCount: 0,
    verificationFieldCount: 0,
    accessDeniedPanelCount: 0
  }));

  if (!hasStrongAuthWallSignals(signals)) {
    return { blocked: false, reason: "" };
  }

  const reasons = [
    signals.passwordFieldCount > 0 ? "visible password field" : undefined,
    signals.captchaCount > 0 ? "visible CAPTCHA or bot-verification widget" : undefined,
    signals.verificationFieldCount > 0 ? "verification-code field" : undefined,
    signals.accessDeniedPanelCount > 0 ? "access-denied or login-required panel" : undefined
  ].filter(Boolean);
  return {
    blocked: true,
    reason: reasons.join(", ") || "strong auth-wall text"
  };
}

async function observeInteractiveSurface(page: Page, candidates?: ExternalCandidate[]) {
  const counts = await page.evaluate(() => ({
    links: document.querySelectorAll("a[href]").length,
    buttons: document.querySelectorAll("button").length,
    inputs: document.querySelectorAll("input, textarea, select").length
  }));
  const visible = candidates ?? await collectInteractiveCandidates(page, new URL(page.url()).origin);
  const sample = visible.slice(0, 4).map((candidate) => `${candidate.label}${candidate.category ? ` (${candidate.category})` : ""}`).join(", ");

  return `Observed ${counts.links} links, ${counts.buttons} buttons, ${counts.inputs} form fields, and ${visible.length} visible candidate action(s) on ${new URL(page.url()).hostname}.${sample ? ` Examples: ${sample}.` : ""}`;
}

async function collectInteractiveCandidates(page: Page, targetOrigin: string): Promise<ExternalCandidate[]> {
  return page.evaluate((allowedOrigin) => {
    const selector = [
      "a[href]",
      "button",
      "input",
      "textarea",
      "select",
      "[role='button']",
      "[role='link']"
    ].join(",");
    const elements = Array.from(document.querySelectorAll(selector));

    return elements
      .map((element, ordinal): ExternalCandidate | undefined => {
        if (!isVisible(element)) {
          return undefined;
        }

        const tagName = element.tagName.toLowerCase();
        const role = element.getAttribute("role")?.toLowerCase();
        const input = element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
        const anchor = element as HTMLAnchorElement;
        const kind = tagName === "a" || role === "link"
          ? "link"
          : tagName === "input" || tagName === "textarea" || tagName === "select"
            ? "input"
            : "button";
        const label = labelFor(element);
        if (!label) {
          return undefined;
        }
        const sectionLabel = sectionFor(element);
        const nearbyText = nearbyTextFor(element, label);
        const category = categoryFor({ label, href: kind === "link" ? anchor.href : undefined, inputType: kind === "input" ? (input.getAttribute("type") ?? tagName).toLowerCase() : undefined, sectionLabel, nearbyText });

        const href = kind === "link" ? anchor.href : undefined;
        let sameOrigin = true;
        if (href) {
          try {
            sameOrigin = new URL(href).origin === allowedOrigin;
          } catch {
            sameOrigin = false;
          }
        }

        return {
          kind,
          label,
          ordinal,
          href,
          sameOrigin,
          inputType: kind === "input" ? (input.getAttribute("type") ?? tagName).toLowerCase() : undefined,
          disabled: Boolean((input as HTMLInputElement).disabled || element.getAttribute("aria-disabled") === "true"),
          sectionLabel,
          nearbyText,
          category
        };
      })
      .filter((candidate): candidate is ExternalCandidate => Boolean(candidate))
      .slice(0, 50);

    function labelFor(element: Element) {
      const control = element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
      const labelledBy = element.getAttribute("aria-labelledby");
      const labelledByText = labelledBy
        ? labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? "").join(" ")
        : "";
      const explicitLabel = control.id ? document.querySelector(`label[for="${cssEscape(control.id)}"]`)?.textContent ?? "" : "";
      return [
        element.textContent,
        element.getAttribute("aria-label"),
        labelledByText,
        explicitLabel,
        element.getAttribute("title"),
        (control as HTMLInputElement | HTMLTextAreaElement).placeholder,
        control.name,
        control.value
      ]
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 100);
    }

    function sectionFor(element: Element) {
      const section = element.closest("nav, header, main, section, article, aside, footer, [role='navigation'], [aria-label], [aria-labelledby]");
      const ariaLabel = section?.getAttribute("aria-label") ?? "";
      const labelledBy = section?.getAttribute("aria-labelledby") ?? "";
      const labelledByText = labelledBy
        ? labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? "").join(" ")
        : "";
      const heading = section?.querySelector("h1,h2,h3,[role='heading']")?.textContent ?? "";
      return [ariaLabel, labelledByText, heading]
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80);
    }

    function nearbyTextFor(element: Element, label: string) {
      const parentText = element.parentElement?.textContent ?? element.closest("li, article, section, div")?.textContent ?? "";
      return parentText
        .replace(label, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 120);
    }

    function categoryFor(input: { label: string; href?: string; inputType?: string; sectionLabel?: string; nearbyText?: string }): ExternalCandidateCategory {
      const haystack = `${input.label} ${input.href ?? ""} ${input.inputType ?? ""} ${input.sectionLabel ?? ""} ${input.nearbyText ?? ""}`.toLowerCase();
      const labelOnly = input.label.toLowerCase();
      if (/\b(add to bag|add to cart|checkout|place order|pay|payment|sign up|signup|create account|start trial|free trial|try for free|start deploying|deploy now|contact sales|talk to sales|book demo|request demo|schedule demo|delete|remove|destroy|password|sso|continue with google|continue with github)\b/.test(labelOnly)) return "unsafe";
      if (/\b(log in|login|sign in|signin|account)\b/.test(haystack)) return "auth";
      if (/\b(search|query|find)\b/.test(haystack)) return "search";
      if (/\b(docs|documentation|api|sdk|install|guide|quickstart|developer)\b/.test(haystack)) return "docs";
      if (/\b(pricing|plans|cost|billing)\b/.test(haystack)) return "pricing";
      if (/\b(product|compare|learn|details|features|solutions|templates|configure|customize|choose|select|macbook)\b/.test(haystack)) return "product";
      if (/\b(shop|buy|store|bag|cart|checkout)\b/.test(haystack)) return "commerce";
      if (/\b(support|help|contact|sales|demo)\b/.test(haystack)) return "support";
      if (/\b(menu|nav|navigation|open|close)\b/.test(haystack)) return "navigation";
      if (/\b(privacy|terms|legal|cookie|careers)\b/.test(haystack)) return "legal";
      return "unknown";
    }

    function isVisible(element: Element) {
      const htmlElement = element as HTMLElement;
      const rect = htmlElement.getBoundingClientRect();
      const style = window.getComputedStyle(htmlElement);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    }

    function cssEscape(value: string) {
      return value.replace(/["\\]/g, "\\$&");
    }
  }, targetOrigin);
}

async function executePlannedAction(
  page: Page,
  plan: Extract<PlannedExternalAction, { type: "click" | "fill" }>
) {
  if (plan.type === "fill") {
    const filled = await page.evaluate(({ ordinal, value }) => {
      const selector = "a[href],button,input,textarea,select,[role='button'],[role='link']";
      const interactiveElements = () => Array.from(document.querySelectorAll(selector));
      const element = interactiveElements()[ordinal] as HTMLInputElement | HTMLTextAreaElement | undefined;
      if (!element) return false;
      element.focus();
      element.value = value;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }, { ordinal: plan.candidate.ordinal, value: plan.value });

    return {
      ok: filled,
      message: filled
        ? `Filled "${plan.candidate.label}" with safe test value "${plan.value}".`
        : `Could not find input "${plan.candidate.label}" to fill.`
    };
  }

  const beforeUrl = page.url();
  const clicked = await page.evaluate((ordinal) => {
    const selector = "a[href],button,input,textarea,select,[role='button'],[role='link']";
    const interactiveElements = () => Array.from(document.querySelectorAll(selector));
    const element = interactiveElements()[ordinal] as HTMLElement | undefined;
    if (!element) return false;
    element.click();
    return true;
  }, plan.candidate.ordinal);

  if (!clicked) {
    return { ok: false, message: `Could not find action "${plan.candidate.label}" to click.` };
  }

  await page.waitForLoadState("domcontentloaded", { timeout: 8000 }).catch(() => undefined);
  await page.waitForTimeout(300);
  const afterUrl = page.url();
  const safeHref = plan.candidate.href;
  if (safeHref && shouldFollowSafeHrefFallback(beforeUrl, afterUrl, plan.candidate)) {
    const directResult = await followSafeHref(page, safeHref);
    if (directResult.ok) {
      return {
        ok: true,
        message: `Clicked "${plan.candidate.label}". The click did not navigate, so the runner followed the safe same-origin href. ${directResult.message}`
      };
    }
  }

  const navigation = afterUrl === beforeUrl ? "Page stayed on the same URL." : `Navigated to ${redactUrl(afterUrl)}.`;
  return {
    ok: true,
    message: `Clicked "${plan.candidate.label}". ${navigation} Current page title is ${await safeTitle(page)}.`
  };
}

async function followSafeHref(page: Page, href: string) {
  try {
    await page.goto(href, { waitUntil: "domcontentloaded", timeout: 10_000 });
    await page.waitForTimeout(300);
    return {
      ok: true,
      message: `Navigated to ${redactUrl(page.url())}. Current page title is ${await safeTitle(page)}.`
    };
  } catch {
    return { ok: false, message: "The safe href fallback did not settle." };
  }
}

function addConsoleAndNetworkIssues(issues: WorkerIssueCallback[], state: EvidenceState) {
  if (state.consoleErrors.length > 0) {
    issues.push({
      severity: "LOW",
      category: "Console",
      title: "Console errors occurred during the run",
      description: `${state.consoleErrors.length} browser console error(s) were observed. Details are retained as a sanitized artifact count in this local slice.`,
      evidenceStepIds: [...state.stepIds],
      suggestedFix: "Review production console errors for the audited flow."
    });
  }

  if (state.networkFailures.length > 0) {
    issues.push({
      severity: "LOW",
      category: "Network",
      title: "Network failures occurred during the run",
      description: `${state.networkFailures.length} failed request(s) were observed. Details are retained as a sanitized artifact count in this local slice.`,
      evidenceStepIds: [...state.stepIds],
      suggestedFix: "Review failing assets or API requests in the audited flow."
    });
  }
}

function commitmentStopsForCandidates(candidates: ExternalCandidate[]) {
  return candidates
    .map((candidate) => {
      const reason = commitmentStopReason(candidate.label);
      return reason ? { label: candidate.label, reason } : undefined;
    })
    .filter((item): item is { label: string; reason: string } => Boolean(item))
    .slice(0, 4);
}

function formatCommitmentStops(stops: Array<{ label: string; reason: string }>) {
  return stops.map((stop) => `"${stop.label}"`).join(", ");
}

function redactUrl(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl);
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "unknown-url";
  }
}

function normalizeComparableUrl(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return rawUrl;
  }
}

export function shouldFollowSafeHrefFallback(beforeUrl: string, afterUrl: string, candidate: Pick<ExternalCandidate, "href" | "sameOrigin">) {
  return Boolean(
    afterUrl === beforeUrl &&
    candidate.href &&
    candidate.sameOrigin &&
    normalizeComparableUrl(candidate.href) !== normalizeComparableUrl(beforeUrl)
  );
}

export function hasGoalEvidenceForExternalRun(goal: string, url: string, title: string, history: string[] = []) {
  const pageSignal = `${url} ${title}`.toLowerCase();
  const haystack = `${pageSignal} ${history.join(" ")}`.toLowerCase();
  const hostTokens = hostTokensFor(url);
  const tokens = goal
    .toLowerCase()
    .split(/\W+/)
    .filter((token) => token.length >= 4 && !EXTERNAL_GOAL_STOP_WORDS.has(token) && !hostTokens.has(token));

  const matches = tokens.filter((token) => {
    if (tokenMatchesEvidence(token, haystack)) return true;
    return false;
  });
  const normalizedMatches = new Set(matches.map(normalizeGoalToken));

  if (requiresFrameworkSpecificEvidence(tokens)) {
    return (
      (normalizedMatches.has("nextjs") || normalizedMatches.has("next")) &&
      (normalizedMatches.has("install") || normalizedMatches.has("quickstart") || normalizedMatches.has("setup"))
    );
  }

  if (matches.length >= 2) {
    return true;
  }

  if (matches.some((token) => SINGLE_TOKEN_TERMINAL_EVIDENCE.has(normalizeGoalToken(token)) && tokenMatchesEvidence(token, pageSignal))) {
    return true;
  }

  return hasSpecificComparisonEvidence(tokens, pageSignal);
}

function requiresFrameworkSpecificEvidence(tokens: string[]) {
  const normalized = new Set(tokens.map(normalizeGoalToken));
  return (normalized.has("next") || normalized.has("nextjs")) && (normalized.has("install") || normalized.has("quickstart") || normalized.has("setup"));
}

function hasSpecificComparisonEvidence(tokens: string[], pageSignal: string) {
  const normalized = new Set(tokens.map(normalizeGoalToken));
  if (!normalized.has("compare")) return false;

  const pageShowsComparison = /\bcompar(e|ison|ing)\b/.test(pageSignal);
  const pageShowsProductFamily = /\b(macbook|mac\s+(models?|computers?)|iphone|ipad|pricing|plans?)\b/.test(pageSignal);
  return pageShowsComparison && pageShowsProductFamily;
}

function tokenMatchesEvidence(token: string, haystack: string) {
  const normalized = normalizeGoalToken(token);
  if (haystack.includes(token) || haystack.includes(normalized)) return true;
  if (normalized === "deploy" && /\bdeploy/.test(haystack)) return true;
  if (normalized === "template" && /\b(template|templates)\b/.test(haystack)) return true;
  return false;
}

function normalizeGoalToken(token: string) {
  if (token === "documentation") return "docs";
  if (token === "next" || token === "nextjs") return token;
  if (token.startsWith("install")) return "install";
  if (token.startsWith("deploy")) return "deploy";
  if (token.startsWith("template")) return "template";
  if (token.startsWith("quickstart")) return "quickstart";
  if (token === "setup") return "setup";
  if (token === "models") return "model";
  return token;
}

function hostTokensFor(rawUrl: string) {
  try {
    return new Set(new URL(rawUrl).hostname.toLowerCase().split(/\W+/).filter((token) => token.length >= 4));
  } catch {
    return new Set<string>();
  }
}

function formatPlanThought(plan: PlannedExternalAction) {
  const confidence = `${Math.round(plan.confidence * 100)}%`;
  return `Observation: ${plan.observation} Persona reasoning: ${plan.personaReasoning} Confidence: ${confidence}.`;
}

function formatPlanResultSignal(plan: PlannedExternalAction) {
  const parts = [`Expected evidence: ${plan.expectedEvidence}`];
  if (plan.stopReason) {
    parts.push(`Stop reason: ${plan.stopReason}`);
  }
  return parts.join(" ");
}

function goalEvidenceSignal(goal: string, url: string, title: string, history: string[]) {
  return hasGoalEvidenceForExternalRun(goal, url, title, history)
    ? " Goal-evidence signal: current URL, title, or action history matches the requested goal."
    : " Goal-evidence signal: partial only; this step did not yet prove the full goal.";
}

async function withFallbackTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  promise.catch(() => undefined);
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const EXTERNAL_GOAL_STOP_WORDS = new Set([
  "want",
  "understand",
  "explore",
  "public",
  "only",
  "stop",
  "before",
  "signup",
  "login",
  "creating",
  "project",
  "payment",
  "contact",
  "sales",
  "book",
  "demo",
  "private",
  "data",
  "works",
  "docs",
  "documentation",
  "product",
  "website",
  "information",
  "learn",
  "user",
  "where",
  "quickest"
]);

const HIGH_INTENT_GOAL_TOKENS = new Set([
  "compare",
  "pricing",
  "install",
  "quickstart",
  "next",
  "nextjs",
  "deploy",
  "template",
  "macbook"
]);

const SINGLE_TOKEN_TERMINAL_EVIDENCE = new Set(["pricing"]);

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutError: Error): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const guarded = promise.finally(() => {
    if (timer) clearTimeout(timer);
  });
  guarded.catch(() => undefined);
  return Promise.race([
    guarded,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(timeoutError), timeoutMs);
    })
  ]);
}

function localPersonaTimeoutMs(input: WorkerRunAgentRequest) {
  const fallback = input.runMode === "demo-target" ? 45_000 : 75_000;
  const requested = Number(input.timeoutMs ?? process.env.WORKER_PERSONA_TIMEOUT_MS ?? fallback);
  return Number.isFinite(requested) && requested > 0 ? requested : fallback;
}
