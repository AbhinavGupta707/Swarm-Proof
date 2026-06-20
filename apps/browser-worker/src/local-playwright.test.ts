import test from "node:test";
import assert from "node:assert/strict";
import { hasGoalEvidenceForExternalRun, shouldFollowSafeHrefFallback } from "./local-playwright";

test("safe href fallback follows same-origin links when click does not navigate", () => {
  assert.equal(
    shouldFollowSafeHrefFallback("https://vercel.com/", "https://vercel.com/", {
      href: "https://vercel.com/pricing",
      sameOrigin: true
    }),
    true
  );
});

test("safe href fallback does not follow cross-origin, missing, same-page, or already navigated links", () => {
  assert.equal(
    shouldFollowSafeHrefFallback("https://vercel.com/", "https://vercel.com/", {
      href: "https://checkout.vercel.com/pricing",
      sameOrigin: false
    }),
    false
  );
  assert.equal(shouldFollowSafeHrefFallback("https://vercel.com/", "https://vercel.com/", { sameOrigin: true }), false);
  assert.equal(
    shouldFollowSafeHrefFallback("https://vercel.com/pricing", "https://vercel.com/pricing", {
      href: "https://vercel.com/pricing#faq",
      sameOrigin: true
    }),
    false
  );
  assert.equal(
    shouldFollowSafeHrefFallback("https://vercel.com/", "https://vercel.com/pricing", {
      href: "https://vercel.com/pricing",
      sameOrigin: true
    }),
    false
  );
});

test("external run can stop once a goal-relevant public page is reached", () => {
  assert.equal(
    hasGoalEvidenceForExternalRun(
      "Understand pricing and deploying a Next.js app from public docs.",
      "https://vercel.com/pricing",
      "Vercel Pricing: Hobby, Pro, and Enterprise plans",
      []
    ),
    true
  );
  assert.equal(
    hasGoalEvidenceForExternalRun(
      "Understand pricing and deploying a Next.js app from public docs.",
      "https://vercel.com/docs/frameworks/full-stack/tanstack-start",
      "TanStack Start on Vercel",
      ["Clicked docs framework link."]
    ),
    true
  );
});

test("external run does not stop on generic pages without goal evidence", () => {
  assert.equal(
    hasGoalEvidenceForExternalRun(
      "Understand pricing and deploying a Next.js app from public docs.",
      "https://vercel.com/",
      "Agentic Infrastructure",
      []
    ),
    false
  );
});
