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
      "https://vercel.com/docs/frameworks/nextjs",
      "Next.js on Vercel",
      ["Clicked Next.js deployment docs framework link."]
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
  assert.equal(
    hasGoalEvidenceForExternalRun(
      "Find how to install Supabase in a Next.js app and understand the quickest setup path.",
      "https://supabase.com/docs/guides/ai-tools/ai-prompts",
      "AI Prompts | Supabase Docs",
      ["Clicked Start with Supabase AI prompts."]
    ),
    false
  );
  assert.equal(
    hasGoalEvidenceForExternalRun(
      "Find the Next.js quickstart and installation instructions for Supabase.",
      "https://supabase.com/docs/guides/getting-started/quickstarts/tanstack",
      "Use Supabase with TanStack Start | Supabase Docs",
      ["Clicked TanStack Start."]
    ),
    false
  );
  assert.equal(
    hasGoalEvidenceForExternalRun(
      "Compare MacBook Air options and find where a user would learn pricing and configuration choices.",
      "https://www.apple.com/mac/",
      "Mac - Apple",
      ["Clicked Compare."]
    ),
    false
  );
  assert.equal(
    hasGoalEvidenceForExternalRun(
      "Compare MacBook Air options and find where a user would learn pricing and configuration choices.",
      "https://www.apple.com/macbook-neo/",
      "MacBook Neo - Apple",
      ["Clicked Learn more, MacBook Neo."]
    ),
    false
  );
});

test("external run accepts specific install or comparison goal evidence", () => {
  assert.equal(
    hasGoalEvidenceForExternalRun(
      "Find how to install Supabase in a Next.js app and understand the quickest setup path.",
      "https://supabase.com/docs/guides/getting-started/quickstarts/nextjs",
      "Use Supabase with Next.js",
      ["Clicked Next.js quickstart and install guide."]
    ),
    true
  );
  assert.equal(
    hasGoalEvidenceForExternalRun(
      "Compare MacBook Air options and understand which model fits me.",
      "https://www.apple.com/mac/compare/",
      "Compare Mac Models - Apple",
      ["Clicked Compare Mac models."]
    ),
    true
  );
});
