export type EvidenceTestStep = {
  stepIndex: number;
  action: string;
  result: string;
  thought?: string;
  url?: string;
};

export type EvidenceTestIssue = {
  title: string;
  category: string;
  severity: string;
};

export function buildPlaywrightTest(input: { name: string; targetUrl: string; goal: string }) {
  return `import { test, expect } from '@playwright/test';

test('${input.name}', async ({ page }) => {
  await page.goto('${input.targetUrl}');
  await page.getByRole('link', { name: /get started|sign up/i }).click();
  await page.getByLabel(/email/i).fill('demo@example.com');
  await page.getByLabel(/password/i).fill('TestPassword123!');
  await page.getByRole('link', { name: /create account/i }).click();
  await page.getByLabel(/project name/i).fill('Launch review');
  await page.getByRole('link', { name: /create project/i }).first().click();
  await expect(page.getByText(/people/i)).toBeVisible();
});
`;
}

export function buildEvidencePlaywrightTest(input: {
  name: string;
  targetUrl: string;
  goal: string;
  steps: EvidenceTestStep[];
  issues: EvidenceTestIssue[];
}) {
  const targetUrl = escapeForSingleQuotedString(input.targetUrl);
  const testName = escapeForSingleQuotedString(input.name);
  const demoTarget = isDemoTargetUrl(input.targetUrl);
  const comments = input.steps.slice(0, 8).map((step) =>
    `  // Observed SwarmProof evidence: step ${step.stepIndex}, ${step.action} - ${truncateForComment(step.result)}`
  );
  const actions = buildObservedActions(input.steps, demoTarget);
  const assertionPattern = assertionPatternFor(input, demoTarget);

  return `import { test, expect } from '@playwright/test';

test('${testName}', async ({ page }) => {
  await page.goto('${targetUrl}');
${comments.length ? `${comments.join("\n")}\n` : "  // Observed SwarmProof evidence was unavailable; verify selectors before committing.\n"}${actions.join("\n")}
  // Starter assertion inferred from SwarmProof evidence; tighten it before committing.
  await expect(page.getByText(/${assertionPattern}/i).first()).toBeVisible();
});
`;
}

function buildObservedActions(steps: EvidenceTestStep[], demoTarget: boolean) {
  if (!demoTarget) {
    return buildExternalObservedActions(steps);
  }

  const text = steps.map((step) => `${step.action} ${step.result} ${step.thought ?? ""}`).join(" ").toLowerCase();
  const actions: string[] = [];

  if (/\b(signup|sign up|create account|get started|account)\b/.test(text)) {
    actions.push("  await page.getByRole('link', { name: /get started|sign up/i }).first().click();");
    actions.push("  await page.getByLabel(/email/i).fill('demo@example.com');");
    actions.push("  await page.getByLabel(/password/i).fill('TestPassword123!');");
    actions.push("  await page.getByRole('link', { name: /create account|sign up/i }).first().click();");
  }

  if (/\b(project|create project|launch review)\b/.test(text)) {
    actions.push("  await page.getByLabel(/project name/i).fill('Launch review');");
    actions.push("  await page.getByRole('link', { name: /^create project$/i }).first().click();");
  }

  if (/\b(invite|people|teammate|email)\b/.test(text)) {
    actions.push("  await page.getByLabel(/email/i).fill('teammate@example.com');");
    actions.push("  await page.getByRole('button', { name: /invite teammate|add people/i }).first().click();");
  }

  if (actions.length === 0) {
    actions.push("  await page.waitForLoadState('domcontentloaded');");
  }

  return [...new Set(actions)];
}

function buildExternalObservedActions(steps: EvidenceTestStep[]) {
  const actions: string[] = [];

  for (const step of steps) {
    const clicked = step.result.match(/Clicked "([^"]+)"/i);
    if (clicked?.[1]) {
      const labelPattern = escapeForRegexLiteral(clicked[1]);
      actions.push(`  await page.getByRole('link', { name: /${labelPattern}/i }).or(page.getByRole('button', { name: /${labelPattern}/i })).first().click();`);
    }

    const filled = step.result.match(/Filled "([^"]+)" with safe test value "([^"]+)"/i);
    if (filled?.[1] && filled[2]) {
      actions.push(`  await page.getByLabel(/${escapeForRegexLiteral(filled[1])}/i).fill('${escapeForSingleQuotedString(filled[2])}');`);
    }

    if (actions.length >= 4) {
      break;
    }
  }

  if (actions.length === 0) {
    actions.push("  await page.waitForLoadState('domcontentloaded');");
  }

  return [...new Set(actions)];
}

function assertionPatternFor(input: { goal: string; steps: EvidenceTestStep[]; issues: EvidenceTestIssue[] }, demoTarget: boolean) {
  const source = [
    input.goal,
    input.issues.map((issue) => `${issue.title} ${issue.category}`).join(" "),
    input.steps.map((step) => `${step.result} ${step.thought ?? ""}`).join(" ")
  ].join(" ");
  if (demoTarget) {
    const keywords = ["invite", "people", "project", "account", "error", "blocked", "success"].filter((word) => source.toLowerCase().includes(word));
    return keywords.length ? keywords.slice(0, 4).join("|") : "project|people|invite|error";
  }

  const keywords = meaningfulAssertionTokens(source).filter((word) => !EXTERNAL_ASSERTION_STOP_WORDS.has(word));
  return keywords.length ? keywords.slice(0, 4).join("|") : "loaded|continue|product";
}

function truncateForComment(value: string) {
  return value.replace(/\s+/g, " ").replace(/\*\//g, "* /").slice(0, 140);
}

function escapeForSingleQuotedString(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function escapeForRegexLiteral(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\//g, "\\/");
}

function meaningfulAssertionTokens(value: string) {
  return value
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 4)
    .slice(0, 40);
}

function isDemoTargetUrl(value: string) {
  try {
    return new URL(value, "https://swarmproof.local").pathname.startsWith("/demo-target");
  } catch {
    return value.startsWith("/demo-target");
  }
}

const EXTERNAL_ASSERTION_STOP_WORDS = new Set([
  "audit",
  "before",
  "blocked",
  "click",
  "clicked",
  "current",
  "error",
  "evidence",
  "explored",
  "external",
  "failed",
  "goal",
  "invite",
  "loaded",
  "page",
  "people",
  "product",
  "project",
  "public",
  "result",
  "runner",
  "safely",
  "safety",
  "step",
  "stopped",
  "swarmproof",
  "target",
  "test",
  "user"
]);
