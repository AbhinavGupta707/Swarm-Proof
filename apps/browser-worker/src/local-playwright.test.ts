import test from "node:test";
import assert from "node:assert/strict";
import { shouldFollowSafeHrefFallback } from "./local-playwright";

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
