import test from "node:test";
import assert from "node:assert/strict";
import {
  appendEvent,
  blockWorkerAuditRun,
  completeWorkerRunAsync,
  completeWorkerRun,
  createAudit,
  createAuditAsync,
  createShare,
  createShareAsync,
  generateAuditReportWithAi,
  getArtifactStorageStatus,
  getAuditArtifacts,
  getAuditEventsAsync,
  getAuditEvents,
  getAuditOverviewAsync,
  getAuditOverview,
  getDatabaseStatus,
  getSharedReportAsync,
  getSharedReport,
  preflightTargetUrl,
  recordWorkerStepAsync,
  recordWorkerStep,
  resetMemoryStoreForTests,
  runPreflightAsync,
  runPreflight,
  startAuditRun,
  startWorkerAuditRunAsync,
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
  assert.equal(overview.provider, "demo");
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
  assert.match(generated, /Observed SwarmProof evidence/);
});

test("evidence report synthesis links worker steps, artifacts, bug export, and generated tests", () => {
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
  const plan = startWorkerAuditRun(created.audit.id, baseUrl);
  const runId = plan.runIds[0];
  assert.ok(runId);

  const step = recordWorkerStep({
    runId,
    stepIndex: 1,
    action: "find_invite",
    status: "warning",
    thought: "Looked for invite teammate CTA.",
    result: "No Invite teammate action is visible; Add people is ambiguous.",
    screenshotBase64: "ZmFrZS1wbmc=",
    url: `${baseUrl}/demo-target/invite`
  });

  completeWorkerRun({
    runId,
    success: false,
    status: "BLOCKED",
    summary: "Blocked by ambiguous invite copy.",
    issues: [{
      severity: "MEDIUM",
      category: "Information architecture",
      title: "Invite teammate CTA is hard to recognize",
      description: "A real run found Add people instead of Invite teammate.",
      evidenceStepIds: [step.id],
      suggestedFix: "Rename Add people to Invite teammate."
    }]
  });

  const overview = getAuditOverview(created.audit.id);
  assert.match(overview.report?.summary ?? "", /evidence-backed trace/);
  assert.match(overview.report?.markdown ?? "", /## Persona results/);
  assert.match(overview.report?.markdown ?? "", /## Reproduction evidence/);
  assert.match(overview.report?.markdown ?? "", /## Bug export/);
  assert.match(overview.report?.markdown ?? "", /Invite teammate CTA is hard to recognize/);
  assert.match(overview.report?.markdown ?? "", /normal step 1, warning/);
  assert.match(overview.report?.markdown ?? "", new RegExp(step.artifactId ?? "artifact_"));
  assert.equal(overview.report?.markdown.includes("ZmFrZS1wbmc="), false);
  assert.match(overview.generatedTest, /Observed SwarmProof evidence/);
  assert.match(overview.generatedTest, /page\.goto/);
  assert.match(overview.generatedTest, /getByRole/);
  assert.match(overview.generatedTest, /expect/);
});

test("AI report synthesis falls back deterministically when no provider key is configured", async () => {
  resetMemoryStoreForTests();
  const hadProviderKey = Object.prototype.hasOwnProperty.call(process.env, "FIREWORKS_API_KEY");
  const previousKey = process.env.FIREWORKS_API_KEY;
  delete process.env.FIREWORKS_API_KEY;
  try {
    const created = createAudit({
      targetUrl: "/demo-target",
      goal: "Sign up, create a project, invite a teammate.",
      modes: ["normal"],
      baseUrl
    });

    assert.equal(created.ok, true);
    if (!created.ok) throw new Error("Audit creation failed");

    startAuditRun(created.audit.id);
    const report = await generateAuditReportWithAi(created.audit.id);
    assert.match(report.summary, /evidence-backed trace/);
    assert.match(report.markdown, /## Bug export/);
    assert.match(report.reportJson.playwrightTests[0]?.code ?? "", /Observed SwarmProof evidence/);
  } finally {
    if (hadProviderKey) {
      process.env.FIREWORKS_API_KEY = previousKey;
    } else {
      delete process.env.FIREWORKS_API_KEY;
    }
  }
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
  const events = getAuditEvents(created.audit.id);
  assert.equal(events.provider, "local-playwright");
  assert.equal(events.jobs.length, 3);
  assert.equal(events.issues.length, 0);

  const blocked = blockWorkerAuditRun(created.audit.id, "Worker dispatch failed in test.");
  assert.equal(blocked.status, "COMPLETED");
  assert.equal(blocked.runs.every((run) => run.status === "BLOCKED"), true);
  assert.equal(blocked.issues.some((issue) => issue.title === "Browser worker could not start"), true);
});

test("async persistence boundary preserves audit, callback, report, and share contracts", async () => {
  resetMemoryStoreForTests();
  const created = await createAuditAsync({
    targetUrl: "/demo-target",
    goal: "Sign up, create a project, invite a teammate.",
    modes: ["normal"],
    baseUrl
  });

  assert.equal(created.ok, true);
  if (!created.ok) throw new Error("Audit creation failed");

  await runPreflightAsync(created.audit.id);
  const plan = await startWorkerAuditRunAsync(created.audit.id, baseUrl);
  const runId = plan.runIds[0];
  assert.ok(runId);

  const step = await recordWorkerStepAsync({
    auditId: created.audit.id,
    runId,
    stepIndex: 1,
    action: "goto",
    status: "passed",
    thought: "Open product.",
    result: "Product loaded in a live worker path.",
    screenshotBase64: "ZmFrZS1wbmc=",
    url: `${baseUrl}/demo-target`
  });

  const completed = await completeWorkerRunAsync({
    auditId: created.audit.id,
    runId,
    success: true,
    status: "SUCCEEDED",
    summary: "Async worker callback completed.",
    artifacts: [{ type: "NETWORK_LOG", url: "memory://network", meta: { requests: 2 } }]
  });

  assert.equal(completed.status, "COMPLETED");
  assert.equal(completed.runs[0]?.status, "SUCCEEDED");
  assert.equal((completed.artifacts?.length ?? 0) >= 2, true);

  const events = await getAuditEventsAsync(created.audit.id);
  assert.equal(events.steps.some((item) => item.id === step.id), true);
  assert.equal(events.events.some((event) => event.name === "run_completed"), true);

  const overview = await getAuditOverviewAsync(created.audit.id);
  assert.match(overview.generatedTest, /page\.goto/);

  const share = await createShareAsync(created.audit.id, baseUrl);
  const shared = await getSharedReportAsync(share.shareToken);
  assert.equal(shared?.id, created.audit.id);
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
