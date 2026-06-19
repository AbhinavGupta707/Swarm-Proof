import test from "node:test";
import assert from "node:assert/strict";
import { isCrossOriginNavigation, isLikelyAuthWall, isUnsafeWorkerUrl, shouldSkipExternalAction } from "./safety";

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
