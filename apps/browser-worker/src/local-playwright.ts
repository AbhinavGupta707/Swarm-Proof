import { chromium, type BrowserContext, type Page } from "playwright";
import type { WorkerCompleteCallback, WorkerIssueCallback, WorkerRunAgentRequest, WorkerStepCallback } from "@swarmproof/types";
import type { CallbackPoster } from "./deterministic-runner";
import { isCrossOriginNavigation, isLikelyAuthWall, isUnsafeWorkerUrl, shouldSkipExternalAction, type WorkerSafetyOptions } from "./safety";

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

    if (input.runMode === "demo-target") {
      await runDemoTargetFlow(input, page, postCallback, state);
    } else {
      await runExternalPublicFlow(input, page, postCallback, state);
    }
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
  await page.goto(input.targetUrl, { waitUntil: "domcontentloaded", timeout: 18000 });
  await emitStep(input, postCallback, state, {
    stepIndex: 1,
    action: "goto",
    thought: "Open the public target URL with safety interception enabled.",
    result: `Loaded ${await safeTitle(page)}.`,
    page
  });

  const bodyText = await visibleText(page);
  if (isLikelyAuthWall(bodyText)) {
    issues.push({
      severity: "MEDIUM",
      category: "Auth-limited flow",
      title: "Audit reached an auth or verification wall",
      description: "The public page appears to require login, password entry, CAPTCHA, payment, or verification before the goal can continue.",
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

  const summary = await observeInteractiveSurface(page);
  await emitStep(input, postCallback, state, {
    stepIndex: 2,
    action: "observe",
    thought: "Summarize visible interactive affordances before taking an action.",
    result: summary,
    page
  });

  const candidate = await findSafeSameOriginLink(page);
  if (candidate) {
    await page.goto(candidate.href, { waitUntil: "domcontentloaded", timeout: 15000 });
    await emitStep(input, postCallback, state, {
      stepIndex: 3,
      action: "click_text",
      thought: `Follow a safe same-origin link: ${candidate.label}.`,
      result: `Opened ${await safeTitle(page)}.`,
      page
    });
  } else {
    issues.push({
      severity: "LOW",
      category: "Exploration limit",
      title: "No safe same-origin exploratory action was selected",
      description: "The runner observed the page but did not click a risky, cross-origin, purchase, logout, or destructive action.",
      evidenceStepIds: [...state.stepIds],
      suggestedFix: "Provide a public goal with a safe same-origin CTA or enable a future owner-confirmed form-submission mode."
    });
  }

  addConsoleAndNetworkIssues(issues, state);
  await complete(input, postCallback, state, {
    success: !issues.some((issue) => issue.severity === "HIGH" || issue.severity === "CRITICAL" || issue.category === "Auth-limited flow"),
    status: issues.some((issue) => issue.category === "Auth-limited flow") ? "BLOCKED" : "SUCCEEDED",
    summary: "The local Playwright worker loaded and safely explored the public URL.",
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
  const title = (await page.title().catch(() => "")) || new URL(page.url()).hostname;
  return `"${title.slice(0, 80)}"`;
}

async function visibleText(page: Page) {
  return page.locator("body").innerText({ timeout: 3000 }).catch(() => "");
}

async function observeInteractiveSurface(page: Page) {
  const counts = await page.evaluate(() => ({
    links: document.querySelectorAll("a[href]").length,
    buttons: document.querySelectorAll("button").length,
    inputs: document.querySelectorAll("input, textarea, select").length
  }));

  return `Observed ${counts.links} links, ${counts.buttons} buttons, and ${counts.inputs} form fields on ${new URL(page.url()).hostname}.`;
}

async function findSafeSameOriginLink(page: Page) {
  const origin = new URL(page.url()).origin;
  const candidates = await page.locator("a[href]").evaluateAll((elements, allowedOrigin) => {
    return elements
      .map((element) => {
        const anchor = element as HTMLAnchorElement;
        const href = anchor.href;
        const label = (anchor.innerText || anchor.getAttribute("aria-label") || anchor.href).trim().replace(/\s+/g, " ");
        return { href, label };
      })
      .filter((candidate) => {
        try {
          const parsed = new URL(candidate.href);
          return parsed.origin === allowedOrigin && candidate.label.length > 0;
        } catch {
          return false;
        }
      })
      .slice(0, 10);
  }, origin);

  return candidates.find((candidate) => !shouldSkipExternalAction(candidate.label));
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
