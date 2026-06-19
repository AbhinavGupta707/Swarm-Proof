import test from "node:test";
import assert from "node:assert/strict";
import { planExternalAction, type ExternalCandidate } from "./external-planner";

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
