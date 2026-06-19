import test from "node:test";
import assert from "node:assert/strict";
import { commitmentStopReason, hasStrongAuthWallSignals, isCrossOriginNavigation, isLikelyAuthWall, isUnsafeWorkerUrl, shouldSkipExternalAction } from "./safety";

test("worker safety blocks local, private, metadata, and internal URLs", () => {
  const blocked = [
    "http://localhost:3000/demo-target",
    "http://127.0.0.1:3000",
    "http://10.0.0.2",
    "http://172.20.0.2",
    "http://192.168.1.10",
    "http://169.254.169.254/latest/meta-data",
    "http://metadata.google.internal",
    "http://service.local",
    "http://service.internal",
    "http://intranet"
  ];

  for (const url of blocked) {
    assert.equal(isUnsafeWorkerUrl(url), true, `${url} should be blocked`);
  }
});

test("worker safety allows the local app origin only when explicitly scoped", () => {
  assert.equal(isUnsafeWorkerUrl("http://localhost:3000/demo-target"), true);
  assert.equal(
    isUnsafeWorkerUrl("http://localhost:3000/demo-target", { allowLocalAppOrigin: "http://localhost:3000" }),
    false
  );
});

test("worker external navigation and action guards are conservative", () => {
  assert.equal(isCrossOriginNavigation("https://example.com/pricing", "https://example.com"), false);
  assert.equal(isCrossOriginNavigation("https://checkout.example/pay", "https://example.com"), true);
  assert.equal(shouldSkipExternalAction("Delete workspace"), true);
  assert.equal(shouldSkipExternalAction("View docs"), false);
  assert.equal(isLikelyAuthWall("Please log in with your password to continue"), true);
});

test("Apple-like nav/footer sign-in text does not trigger an auth wall", () => {
  const publicProductText = `
    MacBook Air
    Apple Intelligence. Now with the M4 chip.
    Buy MacBook Air
    Learn more
    Compare all Mac models
    Sign in to your Apple Account in the footer
    Account Shopping Bag
  `;

  assert.equal(isLikelyAuthWall(publicProductText), false);
  assert.equal(hasStrongAuthWallSignals({ visibleText: publicProductText }), false);
});

test("strong login, password, CAPTCHA, and verification pages trigger auth wall detection", () => {
  assert.equal(isLikelyAuthWall("Please log in with your password to continue"), true);
  assert.equal(isLikelyAuthWall("Complete this CAPTCHA to verify you are human"), true);
  assert.equal(isLikelyAuthWall("Enter the verification code sent to your phone"), true);
  assert.equal(hasStrongAuthWallSignals({ passwordFieldCount: 1 }), true);
  assert.equal(hasStrongAuthWallSignals({ captchaCount: 1 }), true);
  assert.equal(hasStrongAuthWallSignals({ verificationFieldCount: 1 }), true);
});

test("commerce policy allows exploration but blocks commitment actions", () => {
  for (const label of ["Buy MacBook Air", "Shop Mac", "Compare", "Customize", "Choose", "Select", "Learn more"]) {
    assert.equal(shouldSkipExternalAction(label), false, `${label} should be allowed`);
  }

  for (const label of ["Add to Bag", "Checkout", "Place Order", "Pay", "Confirm", "Subscribe", "Book", "Reserve", "Delete", "Logout"]) {
    assert.equal(shouldSkipExternalAction(label), true, `${label} should be blocked`);
    assert.equal(typeof commitmentStopReason(label), "string");
  }
});
