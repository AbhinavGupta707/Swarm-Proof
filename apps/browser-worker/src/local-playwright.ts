import { chromium, type BrowserContext, type Page } from "playwright";
import { personaProfileForMode, type WorkerCompleteCallback, type WorkerIssueCallback, type WorkerRunAgentRequest, type WorkerStepCallback } from "@swarmproof/types";
import type { CallbackPoster } from "./deterministic-runner";
import { isExecutableExternalPlan, planExternalActionWithAi, type ExternalCandidate, type ExternalCandidateCategory, type PlannedExternalAction } from "./external-planner";
import { commitmentStopReason, hasStrongAuthWallSignals, isCrossOriginNavigation, isUnsafeWorkerUrl, type WorkerSafetyOptions } from "./safety";

type EvidenceState = {
  stepIds: string[];
  consoleErrors: string[];
  networkFailures: string[];
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

  const state: EvidenceState = { stepIds: [], consoleErrors: [], networkFailures: [] };
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

  await page.goto(input.targetUrl, { waitUntil: "domcontentloaded", timeout: 18000 });
  visitedHrefs.add(page.url());
  await emitStep(input, postCallback, state, {
    stepIndex: 1,
    action: "goto",
    thought: `${persona.name}: ${persona.goalInterpretation}`,
    result: `Observation: loaded ${await safeTitle(page)} with safety interception enabled. Goal-evidence signal: initial page title and URL are available for this persona.`,
    page
  });
  history.push(`Loaded ${redactUrl(page.url())}.`);

  const initialAuthWall = await withFallbackTimeout(
    detectAuthWall(page),
    5_000,
    { blocked: false, reason: "" }
  );
  if (initialAuthWall.blocked) {
    issues.push({
      severity: "MEDIUM",
      category: "Auth-limited flow",
      title: "Audit reached an auth or verification wall",
      description: `The public page showed a strong authentication or verification signal before the goal could continue: ${initialAuthWall.reason}.`,
      evidenceStepIds: [...state.stepIds],
      suggestedFix: "Run SwarmProof on a public unauthenticated flow or add a future authenticated-testing setup."
    });
    await complete(input, postCallback, state, {
      success: false,
      status: "BLOCKED",
      summary: "The external audit loaded the page but stopped at an auth-limited boundary.",
      issues
    });
    return;
  }

  const maxAgentSteps = Math.max(2, Math.min(input.maxSteps - 1, 4));
  for (let offset = 0; offset < maxAgentSteps; offset += 1) {
    const candidates = await withFallbackTimeout(
      collectInteractiveCandidates(page, new URL(input.targetUrl).origin),
      6_000,
      []
    );
    if (candidates.length === 0) {
      await emitStep(input, postCallback, state, {
        stepIndex: offset + 2,
        action: "observe",
        status: "warning",
        thought: `${persona.name} could not form a safe next action within the page budget.`,
        result: "Observation: the worker could not read a stable set of safe visible actions before the per-step budget elapsed. Confusion signal: no reliable visible control set.",
        page
      });
      issues.push({
        severity: "LOW",
        category: "Exploration limit",
        title: "Visible action discovery timed out",
        description: "The public page did not expose a stable set of safe controls quickly enough for this persona budget.",
        evidenceStepIds: [...state.stepIds],
        suggestedFix: "Retry with a narrower public URL or goal, and keep the target page responsive for unauthenticated users."
      });
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
      page: { url: page.url(), title: await safeTitleText(page) },
      history
    });

    if (plan.type === "none") {
      await emitStep(input, postCallback, state, {
        stepIndex: offset + 2,
        action: "observe",
        status: "warning",
        thought: formatPlanThought(plan),
        result: `${await observeInteractiveSurface(page, candidates)} ${commitmentStops.length > 0 ? `Safety stop visible: ${formatCommitmentStops(commitmentStops)}.` : plan.reason} ${formatPlanResultSignal(plan)}`,
        page
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
        stepIndex: offset + 2,
        action: "done",
        status: "passed",
        thought: formatPlanThought(plan),
        result: `Planner found enough evidence to stop: ${plan.evidence} ${formatPlanResultSignal(plan)}`,
        page
      });
      history.push(`Done: ${plan.evidence}`);
      break;
    }

    if (plan.type === "fail") {
      await emitStep(input, postCallback, state, {
        stepIndex: offset + 2,
        action: "fail",
        status: "failed",
        thought: formatPlanThought(plan),
        result: `Planner could not continue safely: ${plan.evidence} ${formatPlanResultSignal(plan)}`,
        page
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

    await emitStep(input, postCallback, state, {
      stepIndex: offset + 2,
      action: plan.type === "fill" ? "fill_label" : `click_${plan.candidate.kind}`,
      status: result.ok ? "passed" : "failed",
      thought: formatPlanThought(plan),
      result: `${result.message} ${formatPlanResultSignal(plan)}${result.ok ? goalEvidenceSignal(input.goal, page.url(), await safeTitleText(page), history) : " Confusion signal: planned action did not complete."}`,
      page
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

    if (hasGoalEvidenceForExternalRun(input.goal, page.url(), await safeTitleText(page), history)) {
      history.push(`Goal evidence reached on ${redactUrl(page.url())}.`);
      break;
    }

    const authWall = await withFallbackTimeout(
      detectAuthWall(page),
      5_000,
      { blocked: false, reason: "" }
    );
    if (authWall.blocked) {
      issues.push({
        severity: "MEDIUM",
        category: "Auth-limited flow",
        title: "Audit reached an auth or verification wall",
        description: `After a safe public action, the page showed a strong authentication or verification signal: ${authWall.reason}.`,
        evidenceStepIds: [...state.stepIds],
        suggestedFix: "Run SwarmProof on a public unauthenticated flow or add a future authenticated-testing setup."
      });
      break;
    }
  }

  addConsoleAndNetworkIssues(issues, state);
  const authLimited = issues.some((issue) => issue.category === "Auth-limited flow");
  await complete(input, postCallback, state, {
    success: !authLimited && !stoppedForSafety && !issues.some((issue) => issue.severity === "HIGH" || issue.severity === "CRITICAL"),
    status: authLimited || stoppedForSafety ? "BLOCKED" : "SUCCEEDED",
    summary: stoppedForSafety
      ? `The local Playwright worker safely executed ${actionsTaken} public-site action(s), then stopped before cart, checkout, payment, or private-data commitment.`
      : actionsTaken > 0
      ? `The local Playwright worker safely executed ${actionsTaken} public-site action(s).`
      : "The local Playwright worker loaded the public URL but stopped before unsafe or irrelevant actions.",
    issues
  });
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
    screenshotBase64: await screenshotBase64(step.page)
  };

  const recorded = await postCallback<{ id?: string }>("step", payload);
  state.stepIds.push(typeof recorded?.id === "string" ? recorded.id : `${input.runId}:${step.stepIndex}`);
}

async function complete(
  input: WorkerRunAgentRequest,
  postCallback: CallbackPoster,
  state: EvidenceState,
  result: Pick<WorkerCompleteCallback, "success" | "status" | "summary" | "issues">
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
    artifacts
  });
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
  const haystack = `${url} ${title} ${history.join(" ")}`.toLowerCase();
  const hostTokens = hostTokensFor(url);
  const tokens = goal
    .toLowerCase()
    .split(/\W+/)
    .filter((token) => token.length >= 4 && !EXTERNAL_GOAL_STOP_WORDS.has(token) && !hostTokens.has(token));

  const matches = tokens.filter((token) => {
    if (tokenMatchesEvidence(token, haystack)) return true;
    return false;
  });

  if (matches.length >= 2) {
    return true;
  }

  return matches.some((token) => HIGH_INTENT_GOAL_TOKENS.has(normalizeGoalToken(token)));
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
  if (token.startsWith("deploy")) return "deploy";
  if (token.startsWith("template")) return "template";
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
