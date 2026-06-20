import test from "node:test";
import assert from "node:assert/strict";
import type { Page } from "playwright";
import type { ObservedActionCandidate, PageObservation, PageRiskSignal } from "@swarmproof/types";
import { verifyEvidence } from "./evidence-verifier";
import { planExternalActionWithAi } from "./external-planner";
import { compileGoalSpec } from "./goal-spec";
import { externalRunCompletionFromVerifier } from "./local-playwright";
import { observePage } from "./page-observation";

const appleGoal = "Compare MacBook Air options and find where a user would learn pricing and configuration choices.";
const supabaseGoal = "Find the Next.js quickstart and installation instructions for Supabase.";

test("GoalSpec keeps shared rubric stable while persona interpretation changes", () => {
  const normal = compileGoalSpec({
    goal: supabaseGoal,
    targetUrl: "https://supabase.com/docs",
    personaMode: "normal"
  });
  const mobile = compileGoalSpec({
    goal: supabaseGoal,
    targetUrl: "https://supabase.com/docs",
    personaMode: "mobile"
  });

  assert.deepEqual(normal.successRubric, mobile.successRubric);
  assert.deepEqual(normal.mustFind.map((item) => item.id), mobile.mustFind.map((item) => item.id));
  assert.notEqual(normal.personaInterpretation, mobile.personaInterpretation);
  assert.equal(normal.compiledBy, "deterministic");
  assert.equal(normal.mustFind.some((item) => item.id === "framework_nextjs"), true);
  assert.equal(normal.mustFind.some((item) => item.id === "intent_quickstart_install"), true);
});

test("PageObservation sanitizes fixture content and preserves structured candidates", async () => {
  const fakePage = {
    async evaluate() {
      return {
        url: "https://docs.example.test/install?token=secret#private",
        title: "Install guide for owner@example.com",
        headings: ["Next.js setup"],
        visibleSnippets: ["Use password=secret123 to install the demo package."],
        bodyText: "Cookie consent is open. Use password=secret123.",
        actionCandidates: [{
          kind: "link",
          label: "Next.js quickstart owner@example.com",
          href: "https://docs.example.test/nextjs?api_key=secret",
          sameOrigin: true,
          ordinal: 0,
          category: "docs"
        }]
      };
    }
  } as unknown as Page;

  const observation = await observePage(fakePage, "https://docs.example.test");

  assert.equal(observation.url, "https://docs.example.test/install");
  assert.doesNotMatch(observation.title, /owner@example\.com/);
  assert.doesNotMatch(observation.visibleSnippets.join(" "), /secret123/);
  assert.equal(observation.links[0]?.href, "https://docs.example.test/nextjs");
  assert.equal(observation.riskSignals.some((signal) => signal.type === "cookie_modal"), true);
  assert.equal(observation.actionCandidates[0]?.kind, "link");
});

test("Apple-like Neo trap does not satisfy MacBook Air pricing/configuration evidence", () => {
  const goalSpec = compileGoalSpec({ goal: appleGoal, targetUrl: "https://apple-fixture.test/macbook-neo", personaMode: "normal" });
  const verifier = verifyEvidence({
    goalSpec,
    observations: [fixtureObservation({
      url: "https://apple-fixture.test/macbook-neo",
      title: "MacBook Neo - Apple",
      headings: ["MacBook Neo"],
      snippets: ["MacBook Neo from $799. Configure memory and storage for the Neo family."],
      actions: [{ kind: "link", label: "Buy MacBook Neo", href: "https://apple-fixture.test/shop/buy-mac/macbook-neo", sameOrigin: true, ordinal: 0, category: "product" }]
    })]
  });

  assert.notEqual(verifier.verdict, "SUCCEEDED");
  assert.equal(verifier.missingRequirements.some((item) => item.id === "product_macbook_air"), true);
  assert.equal(externalRunCompletionFromVerifier(verifier).success, false);
});

test("Valid Apple-like compare/pricing/configuration page satisfies required evidence", () => {
  const goalSpec = compileGoalSpec({ goal: appleGoal, targetUrl: "https://apple-fixture.test/mac/compare", personaMode: "normal" });
  const verifier = verifyEvidence({
    goalSpec,
    observations: [fixtureObservation({
      url: "https://apple-fixture.test/mac/compare",
      title: "Compare Mac Models - Apple",
      headings: ["Compare Mac models"],
      snippets: [
        "MacBook Air from $999 with 13-inch and 15-inch models.",
        "Customize MacBook Air memory, storage, and chip configuration before checkout."
      ],
      actions: [
        { kind: "link", label: "Compare MacBook Air models", href: "https://apple-fixture.test/mac/compare", sameOrigin: true, ordinal: 0, category: "product" },
        { kind: "button", label: "Customize MacBook Air", ordinal: 1, category: "product" }
      ]
    })]
  });

  assert.equal(verifier.verdict, "SUCCEEDED");
  assert.equal(verifier.missingRequirements.length, 0);
  assert.equal(externalRunCompletionFromVerifier(verifier).status, "SUCCEEDED");
});

test("Supabase TanStack and AI prompt trap does not satisfy Next.js install quickstart", () => {
  const goalSpec = compileGoalSpec({ goal: supabaseGoal, targetUrl: "https://supabase-fixture.test/docs", personaMode: "normal" });
  const verifier = verifyEvidence({
    goalSpec,
    observations: [fixtureObservation({
      url: "https://supabase-fixture.test/docs/guides/ai-tools/ai-prompts",
      title: "AI Prompts | Supabase Docs",
      headings: ["Supabase AI prompts", "TanStack Start"],
      snippets: ["Use Supabase with TanStack Start quickstarts and AI prompt snippets."],
      actions: [{ kind: "link", label: "TanStack quickstart", href: "https://supabase-fixture.test/docs/guides/getting-started/quickstarts/tanstack", sameOrigin: true, ordinal: 0, category: "docs" }]
    })]
  });

  assert.notEqual(verifier.verdict, "SUCCEEDED");
  assert.equal(verifier.missingRequirements.some((item) => item.id === "framework_nextjs"), true);
  assert.equal(externalRunCompletionFromVerifier(verifier).success, false);
});

test("Valid Supabase Next.js quickstart/install page satisfies required evidence", () => {
  const goalSpec = compileGoalSpec({ goal: supabaseGoal, targetUrl: "https://supabase-fixture.test/docs", personaMode: "normal" });
  const verifier = verifyEvidence({
    goalSpec,
    observations: [fixtureObservation({
      url: "https://supabase-fixture.test/docs/guides/getting-started/quickstarts/nextjs",
      title: "Use Supabase with Next.js",
      headings: ["Next.js quickstart"],
      snippets: ["Install @supabase/ssr and set up Supabase in a Next.js app."],
      actions: [{ kind: "link", label: "Next.js quickstart install guide", href: "https://supabase-fixture.test/docs/guides/getting-started/quickstarts/nextjs", sameOrigin: true, ordinal: 0, category: "docs" }]
    })]
  });

  assert.equal(verifier.verdict, "SUCCEEDED");
  assert.equal(verifier.metRequirements.some((item) => item.id === "framework_nextjs"), true);
  assert.equal(verifier.metRequirements.some((item) => item.id === "intent_quickstart_install"), true);
});

test("Auth wall, unsafe links, cookie modal, and no-action fixtures produce safe outcomes", async () => {
  const goalSpec = compileGoalSpec({ goal: supabaseGoal, targetUrl: "https://supabase-fixture.test/docs", personaMode: "normal" });
  const authVerifier = verifyEvidence({
    goalSpec,
    observations: [fixtureObservation({
      url: "https://supabase-fixture.test/login",
      title: "Sign in required",
      headings: ["Authentication required"],
      snippets: ["Please log in to continue."],
      risks: [{ type: "auth_wall", severity: "high", message: "Authentication required." }]
    })]
  });
  const noActionVerifier = verifyEvidence({
    goalSpec,
    observations: [fixtureObservation({
      url: "https://supabase-fixture.test/blank",
      title: "Blank docs shell",
      headings: [],
      snippets: [],
      risks: [{ type: "no_action", severity: "medium", message: "No visible actions." }]
    })]
  });
  const unsafePlanner = await planExternalActionWithAi({
    goal: "Buy a product and stop before checkout.",
    personaMode: "normal",
    candidates: [
      { kind: "button", label: "Checkout", ordinal: 0, category: "unsafe" },
      { kind: "link", label: "Sign up", href: "https://shop-fixture.test/signup", sameOrigin: true, ordinal: 1, category: "unsafe" }
    ],
    page: { url: "https://shop-fixture.test", title: "Fixture shop" },
    history: []
  });

  assert.equal(authVerifier.verdict, "BLOCKED");
  assert.equal(authVerifier.safetyFailures.length > 0, true);
  assert.equal(noActionVerifier.verdict, "BLOCKED");
  assert.equal(unsafePlanner.type, "none");
});

test("AI planner done cannot produce an external success outcome", async () => {
  const goalSpec = compileGoalSpec({ goal: appleGoal, targetUrl: "https://apple-fixture.test/macbook-neo", personaMode: "normal" });
  const verifier = verifyEvidence({
    goalSpec,
    observations: [fixtureObservation({
      url: "https://apple-fixture.test/macbook-neo",
      title: "MacBook Neo - Apple",
      headings: ["MacBook Neo"],
      snippets: ["MacBook Neo has pricing and configuration options."],
      actions: [{ kind: "link", label: "Learn more", href: "https://apple-fixture.test/macbook-neo", sameOrigin: true, ordinal: 0, category: "product" }]
    })]
  });
  const donePlanner = {
    async generateJson<T>() {
      return { action: "done", reason: "The product page has enough words.", evidence: "pricing configuration" } as T;
    }
  };
  const plan = await planExternalActionWithAi({
    goal: appleGoal,
    personaMode: "normal",
    candidates: [{ kind: "link", label: "Learn more", href: "https://apple-fixture.test/macbook-neo", sameOrigin: true, ordinal: 0, category: "product" }],
    page: { url: "https://apple-fixture.test/macbook-neo", title: "MacBook Neo - Apple" },
    history: [],
    aiProvider: donePlanner
  });

  assert.equal(plan.type, "click");
  assert.equal(verifier.verdict, "PARTIAL");
  assert.equal(externalRunCompletionFromVerifier(verifier).success, false);
});

function fixtureObservation(input: {
  url: string;
  title: string;
  headings: string[];
  snippets: string[];
  actions?: ObservedActionCandidate[];
  risks?: PageRiskSignal[];
}): PageObservation {
  const actions = input.actions ?? [];
  return {
    version: 1,
    stepId: "fixture-step",
    url: input.url,
    title: input.title,
    headings: input.headings,
    visibleSnippets: input.snippets,
    links: actions.filter((action) => action.kind === "link"),
    buttons: actions.filter((action) => action.kind === "button"),
    forms: actions.filter((action) => action.kind === "input"),
    actionCandidates: actions,
    pageCategory: "unknown",
    riskSignals: input.risks ?? [],
    evidenceCandidates: [
      { source: "url", text: input.url },
      { source: "title", text: input.title },
      ...input.headings.map((text) => ({ source: "heading" as const, text })),
      ...input.snippets.map((text) => ({ source: "snippet" as const, text })),
      ...actions.map((action) => ({ source: "action" as const, text: `${action.label} ${action.nearbyText ?? ""}` }))
    ],
    capturedAt: "2026-06-20T12:00:00.000Z"
  };
}
