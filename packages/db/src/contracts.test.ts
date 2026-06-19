import test from "node:test";
import assert from "node:assert/strict";
import {
  appendEvent,
  blockWorkerAuditRun,
  completeWorkerRun,
  createAudit,
  createShare,
  getArtifactStorageStatus,
  getAuditArtifacts,
  getAuditEvents,
  getAuditOverview,
  getDatabaseStatus,
  getSharedReport,
  preflightTargetUrl,
  recordWorkerStep,
  resetMemoryStoreForTests,
  runPreflight,
  startAuditRun,
  startWorkerAuditRun
} from "./index";

const baseUrl = "https://swarmproof.test";

test("URL safety blocks private and internal targets while allowing the demo target", () => {
  const blocked = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://10.0.0.2",
    "http://172.16.0.2",
    "http://192.168.1.5",
    "http://[::1]",
    "http://169.254.169.254/latest/meta-data",
    "http://metadata.google.internal",
    "http://example.local",
    "http://service.internal",
    "http://intranet"
  ];

  for (const target of blocked) {
    const result = preflightTargetUrl(target, baseUrl);
    assert.equal(result.loadable, false, `${target} should be blocked`);
  }

  const demo = preflightTargetUrl("/demo-target", baseUrl);
  assert.equal(demo.loadable, true);
  assert.equal(demo.isDemoTarget, true);
});

test("default audit run creates normal, mobile, and chaos personas", () => {
  resetMemoryStoreForTests();
  const created = createAudit({
    targetUrl: "/demo-target",
    goal: "Sign up, create a project, invite a teammate.",
    baseUrl
  });

  assert.equal(created.ok, true);
  if (!created.ok) throw new Error("Audit creation failed");

  startAuditRun(created.audit.id);
  const overview = getAuditOverview(created.audit.id);
  assert.deepEqual(overview.runs.map((run) => run.mode).sort(), ["chaos", "mobile", "normal"]);
  assert.equal(overview.status, "COMPLETED");
});

test("generated Playwright output includes navigation, action, and assertion", () => {
  resetMemoryStoreForTests();
  const created = createAudit({
    targetUrl: "/demo-target",
    goal: "Sign up, create a project, invite a teammate.",
    modes: ["normal"],
    baseUrl
  });

  assert.equal(created.ok, true);
  if (!created.ok) throw new Error("Audit creation failed");

  startAuditRun(created.audit.id);
  const generated = getAuditOverview(created.audit.id).generatedTest;
  assert.match(generated, /page\.goto/);
  assert.match(generated, /getBy(Role|Label)/);
  assert.match(generated, /expect/);
});

test("event sanitization drops unsafe keys and keeps safe scalar props", () => {
  resetMemoryStoreForTests();
  const event = appendEvent("custom_event", undefined, {
    url: "https://private.example",
    content: "raw page text",
    screenshotUrl: "data:image/png;base64,secret",
    token: "secret",
    password: "secret",
    email: "user@example.com",
    credentialKind: "api-key",
    safeCount: 3,
    passed: true,
    category: "UX"
  });

  assert.deepEqual(event.props, { safeCount: 3, passed: true, category: "UX" });
});

test("worker callback contracts record steps, issues, events, and artifacts", () => {
  resetMemoryStoreForTests();
  const created = createAudit({
    targetUrl: "/demo-target",
    goal: "Sign up, create a project, invite a teammate.",
    modes: ["normal"],
    baseUrl
  });

  assert.equal(created.ok, true);
  if (!created.ok) throw new Error("Audit creation failed");

  runPreflight(created.audit.id);
  const [runId] = startAuditRun(created.audit.id);
  const step = recordWorkerStep({
    runId,
    stepIndex: 99,
    action: "screenshot",
    thought: "Capture callback evidence.",
    result: "Evidence captured.",
    screenshotBase64: "ZmFrZS1wbmc=",
    url: `${baseUrl}/demo-target`
  });

  assert.equal(step.artifactId?.startsWith("artifact_"), true);
  assert.equal(getAuditArtifacts(created.audit.id).length >= 1, true);

  const summary = completeWorkerRun({
    runId,
    success: false,
    status: "FAILED",
    summary: "Callback reported a validation issue.",
    issues: [{
      severity: "MEDIUM",
      category: "Validation",
      title: "Callback issue",
      description: "Worker callback issue was persisted through the boundary.",
      evidenceStepIds: [step.id],
      suggestedFix: "Keep callback contract stable."
    }],
    artifacts: [{
      type: "CONSOLE_LOG",
      url: "memory://console-log",
      meta: { entries: 1 }
    }]
  });

  assert.equal(summary.issues.some((issue) => issue.title === "Callback issue"), true);
  assert.equal((summary.artifacts?.length ?? 0) >= 2, true);
  assert.equal(getAuditEvents(created.audit.id).events.some((event) => event.name === "browser_step_completed"), true);
});

test("worker dispatch plans create running jobs without completing deterministic runs", () => {
  resetMemoryStoreForTests();
  const created = createAudit({
    targetUrl: "/demo-target",
    goal: "Sign up, create a project, invite a teammate.",
    baseUrl
  });

  assert.equal(created.ok, true);
  if (!created.ok) throw new Error("Audit creation failed");

  runPreflight(created.audit.id);
  const plan = startWorkerAuditRun(created.audit.id, baseUrl);
  assert.equal(plan.requests.length, 3);
  assert.deepEqual(plan.requests.map((request) => request.persona.mode).sort(), ["chaos", "mobile", "normal"]);
  assert.equal(plan.requests.every((request) => request.runMode === "demo-target"), true);

  const running = getAuditOverview(created.audit.id);
  assert.equal(running.status, "RUNNING");
  assert.equal(running.runs.every((run) => run.status === "RUNNING"), true);
  assert.equal(running.jobs?.every((job) => job.status === "DISPATCHED"), true);

  const blocked = blockWorkerAuditRun(created.audit.id, "Worker dispatch failed in test.");
  assert.equal(blocked.status, "COMPLETED");
  assert.equal(blocked.runs.every((run) => run.status === "BLOCKED"), true);
  assert.equal(blocked.issues.some((issue) => issue.title === "Browser worker could not start"), true);
});

test("share, database status, and artifact status expose persistence-ready contracts", () => {
  resetMemoryStoreForTests();
  const created = createAudit({
    targetUrl: "/demo-target",
    goal: "Sign up, create a project, invite a teammate.",
    modes: ["normal"],
    baseUrl
  });

  assert.equal(created.ok, true);
  if (!created.ok) throw new Error("Audit creation failed");

  startAuditRun(created.audit.id);
  const share = createShare(created.audit.id, baseUrl);
  assert.equal(getSharedReport(share.shareToken)?.id, created.audit.id);
  assert.equal(getDatabaseStatus().prismaReady, true);
  assert.equal(getDatabaseStatus().activeAdapter, "memory");
  assert.equal(getArtifactStorageStatus().localFallback, true);
});
