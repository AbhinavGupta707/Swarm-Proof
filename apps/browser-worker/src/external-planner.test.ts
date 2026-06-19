import test from "node:test";
import assert from "node:assert/strict";
import { planExternalAction, planExternalActionWithAi, type ExternalCandidate } from "./external-planner";

test("external planner picks goal-matching same-origin candidates", () => {
  const candidates: ExternalCandidate[] = [
    { kind: "link", label: "Blog", href: "https://example.com/blog", sameOrigin: true, ordinal: 0 },
    { kind: "link", label: "Create project", href: "https://example.com/projects/new", sameOrigin: true, ordinal: 1 },
    { kind: "link", label: "Create project on partner", href: "https://partner.example.com/create", sameOrigin: false, ordinal: 2 }
  ];

  const plan = planExternalAction({
    goal: "Create a project and invite a teammate",
    personaMode: "normal",
    candidates
  });

  assert.equal(plan.type, "click");
  if (plan.type !== "click") throw new Error("Expected click plan");
  assert.equal(plan.candidate.label, "Create project");
});

test("external planner skips risky, auth, cross-origin, and already visited actions", () => {
  const candidates: ExternalCandidate[] = [
    { kind: "button", label: "Delete workspace", ordinal: 0 },
    { kind: "link", label: "Log in", href: "https://example.com/login", sameOrigin: true, ordinal: 1 },
    { kind: "link", label: "Pricing", href: "https://checkout.example.com/pricing", sameOrigin: false, ordinal: 2 },
    { kind: "link", label: "View docs", href: "https://example.com/docs", sameOrigin: true, ordinal: 3 }
  ];

  const plan = planExternalAction({
    goal: "Read the documentation",
    personaMode: "normal",
    candidates,
    visitedHrefs: ["https://example.com/docs"]
  });

  assert.equal(plan.type, "none");
});

test("external planner allows search fill but blocks unsafe form fields without owner confirmation", () => {
  const candidates: ExternalCandidate[] = [
    { kind: "input", label: "Email", inputType: "email", ordinal: 0 },
    { kind: "input", label: "Search docs", inputType: "search", ordinal: 1 },
    { kind: "input", label: "Password", inputType: "password", ordinal: 2 }
  ];

  const searchPlan = planExternalAction({
    goal: "Find installation docs",
    personaMode: "normal",
    candidates
  });

  assert.equal(searchPlan.type, "fill");
  if (searchPlan.type !== "fill") throw new Error("Expected fill plan");
  assert.equal(searchPlan.candidate.label, "Search docs");
  assert.match(searchPlan.value, /installation docs/);

  const emailPlan = planExternalAction({
    goal: "Invite a teammate by email",
    personaMode: "normal",
    candidates: [candidates[0]],
    allowFormActions: true
  });

  assert.equal(emailPlan.type, "fill");
  if (emailPlan.type !== "fill") throw new Error("Expected owner-confirmed email fill");
  assert.equal(emailPlan.value, "teammate@example.com");
});

test("external planner allows safe commerce exploration", () => {
  const candidates: ExternalCandidate[] = [
    { kind: "link", label: "Mac accessories", href: "https://www.apple.com/shop/accessories", sameOrigin: true, ordinal: 0 },
    { kind: "link", label: "Buy MacBook Air", href: "https://www.apple.com/shop/buy-mac/macbook-air", sameOrigin: true, ordinal: 1 },
    { kind: "button", label: "Customize", ordinal: 2 }
  ];

  const buyPlan = planExternalAction({
    goal: "I want to buy a MacBook Air and understand configuration choices.",
    personaMode: "normal",
    candidates
  });
  assert.equal(buyPlan.type, "click");
  if (buyPlan.type !== "click") throw new Error("Expected buy click plan");
  assert.equal(buyPlan.candidate.label, "Buy MacBook Air");

  const customizePlan = planExternalAction({
    goal: "Customize the MacBook Air configuration.",
    personaMode: "normal",
    candidates: [candidates[2]]
  });
  assert.equal(customizePlan.type, "click");
  if (customizePlan.type !== "click") throw new Error("Expected customize click plan");
  assert.equal(customizePlan.candidate.label, "Customize");
});

test("external planner blocks unsafe commerce commitment actions", () => {
  const candidates: ExternalCandidate[] = [
    { kind: "button", label: "Add to Bag", ordinal: 0 },
    { kind: "link", label: "Checkout", href: "https://www.apple.com/shop/checkout", sameOrigin: true, ordinal: 1 },
    { kind: "button", label: "Place Order", ordinal: 2 },
    { kind: "button", label: "Pay", ordinal: 3 }
  ];

  const plan = planExternalAction({
    goal: "Buy a MacBook Air.",
    personaMode: "normal",
    candidates
  });

  assert.equal(plan.type, "none");
});

test("external planner blocks signup, deployment, sales, trial, and account actions", () => {
  const candidates: ExternalCandidate[] = [
    { kind: "link", label: "Start Deploying", href: "https://vercel.com/new", sameOrigin: true, ordinal: 0 },
    { kind: "link", label: "Sign Up", href: "https://vercel.com/signup", sameOrigin: true, ordinal: 1 },
    { kind: "button", label: "Contact Sales", ordinal: 2 },
    { kind: "button", label: "Book Demo", ordinal: 3 },
    { kind: "button", label: "Start Trial", ordinal: 4 },
    { kind: "button", label: "Create Account", ordinal: 5 }
  ];

  const plan = planExternalAction({
    goal: "Explore deployment, pricing, and docs only.",
    personaMode: "normal",
    candidates
  });

  assert.equal(plan.type, "none");
});

test("AI planner cannot choose unsafe public action ordinals", async () => {
  const candidates: ExternalCandidate[] = [
    { kind: "link", label: "Pricing", href: "https://example.com/pricing", sameOrigin: true, ordinal: 0 },
    { kind: "link", label: "Start Deploying", href: "https://example.com/new", sameOrigin: true, ordinal: 1 }
  ];
  const unsafePlanner = {
    async generateJson<T>() {
      return { action: "choose_candidate", ordinal: 1, reason: "Deploy now." } as T;
    }
  };

  const plan = await planExternalActionWithAi({
    goal: "Explore deployment pricing without signup.",
    personaMode: "normal",
    candidates,
    page: { url: "https://example.com", title: "Example" },
    history: [],
    aiProvider: unsafePlanner
  });

  assert.equal(plan.type, "click");
  if (plan.type !== "click") throw new Error("Expected fallback safe click");
  assert.equal(plan.candidate.label, "Pricing");
});

test("invalid AI planner output falls back to the safe deterministic planner", async () => {
  const candidates: ExternalCandidate[] = [
    { kind: "link", label: "Buy MacBook Air", href: "https://www.apple.com/shop/buy-mac/macbook-air", sameOrigin: true, ordinal: 0 },
    { kind: "button", label: "Add to Bag", ordinal: 1 }
  ];
  const invalidPlanner = {
    async generateJson<T>() {
      return { action: "choose_candidate", ordinal: 1, reason: "Add it to the bag." } as T;
    }
  };

  const plan = await planExternalActionWithAi({
    goal: "Buy a MacBook Air and inspect configuration choices.",
    personaMode: "normal",
    candidates,
    page: { url: "https://www.apple.com/macbook-air/", title: "MacBook Air" },
    history: [],
    aiProvider: invalidPlanner
  });

  assert.equal(plan.type, "click");
  if (plan.type !== "click") throw new Error("Expected deterministic fallback click");
  assert.equal(plan.candidate.label, "Buy MacBook Air");
});
