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
  finalizeTimedOutAudit,
  generateAuditReportWithAi,
  getArtifactStorageStatus,
  getAuditArtifacts,
  getAuditEventsAsync,
  getAuditEvents,
  getAuditOverviewAsync,
  getAuditOverview,
  getDatabaseStatus,
  getPersistenceConfig,
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

test("external evidence reports and generated tests use target-specific evidence instead of demo assertions", () => {
  resetMemoryStoreForTests();
  const created = createAudit({
    targetUrl: "https://www.apple.com/macbook-air/",
    goal: "I want to buy a MacBook Air, inspect configuration choices, and stop before checkout.",
    modes: ["normal"],
    baseUrl
  });

  assert.equal(created.ok, true);
  if (!created.ok) throw new Error("Audit creation failed");

  runPreflight(created.audit.id);
  const plan = startWorkerAuditRun(created.audit.id, baseUrl);
  const runId = plan.runIds[0];
  assert.ok(runId);
  assert.equal(plan.requests[0]?.runMode, "external-public");

  const stepOne = recordWorkerStep({
    auditId: created.audit.id,
    runId,
    stepIndex: 1,
    action: "goto",
    status: "passed",
    thought: "Open the public product page.",
    result: "Loaded \"MacBook Air\".",
    screenshotBase64: "ZmFrZS1wbmc=",
    url: "https://www.apple.com/macbook-air/"
  });
  const runningJob = getAuditEvents(created.audit.id).jobs[0];
  assert.equal(runningJob?.status, "RUNNING");
  assert.equal(typeof runningJob?.lockedAt, "string");

  const stepTwo = recordWorkerStep({
    auditId: created.audit.id,
    runId,
    stepIndex: 2,
    action: "click_link",
    status: "passed",
    thought: "Follow the safe product purchase path.",
    result: "Clicked \"Buy MacBook Air\". Navigated to https://www.apple.com/shop/buy-mac/macbook-air/. Current page title is \"Buy MacBook Air\".",
    screenshotBase64: "ZmFrZS1wbmc=",
    url: "https://www.apple.com/shop/buy-mac/macbook-air/"
  });

  const stepThree = recordWorkerStep({
    auditId: created.audit.id,
    runId,
    stepIndex: 3,
    action: "click_button",
    status: "passed",
    thought: "Inspect safe configuration choices.",
    result: "Clicked \"Customize\". Page stayed on the same URL. Current page title is \"Buy MacBook Air\".",
    screenshotBase64: "ZmFrZS1wbmc=",
    url: "https://www.apple.com/shop/buy-mac/macbook-air/"
  });

  completeWorkerRun({
    auditId: created.audit.id,
    runId,
    success: false,
    status: "BLOCKED",
    summary: "The worker reached MacBook Air configuration choices and stopped before cart or checkout.",
    issues: [
      {
        severity: "LOW",
        category: "Safety stop",
        title: "Audit stopped before checkout or commitment",
        description: "The runner explored the public product path, then stopped before commitment actions: \"Add to Bag\".",
        evidenceStepIds: [stepOne.id, stepTwo.id],
        suggestedFix: "Keep pricing and configuration review available before cart or checkout."
      },
      {
        severity: "LOW",
        category: "Safety stop",
        title: "Audit stopped before checkout or commitment",
        description: "A second persona saw the same Add to Bag commitment boundary.",
        evidenceStepIds: [stepThree.id],
        suggestedFix: "Add a non-committing summary state for QA."
      }
    ]
  });

  const overview = getAuditOverview(created.audit.id);
  assert.equal(overview.issues.length, 1);
  assert.equal(overview.issues[0]?.evidenceStepIds?.length, 3);
  assert.match(overview.report?.summary ?? "", /Safety stop/);
  assert.match(overview.report?.markdown ?? "", /User impact/);
  assert.match(overview.report?.markdown ?? "", /Regression-test note/);
  assert.match(overview.generatedTest, /Buy MacBook Air/);
  assert.match(overview.generatedTest, /Customize/);
  assert.doesNotMatch(overview.generatedTest, /project|people|invite|error/i);
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
  const [runId] = startWorkerAuditRun(created.audit.id, baseUrl).runIds;
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

test("watchdog finalizes timed-out worker runs with a partial report", () => {
  resetMemoryStoreForTests();
  const created = createAudit({
    targetUrl: "https://stripe.com/pricing",
    goal: "Explore public pricing and stop before signup, login, contact sales, payment, or private data.",
    modes: ["normal"],
    baseUrl
  });

  assert.equal(created.ok, true);
  if (!created.ok) throw new Error("Audit creation failed");

  runPreflight(created.audit.id);
  const plan = startWorkerAuditRun(created.audit.id, baseUrl);
  const runId = plan.runIds[0];
  assert.ok(runId);

  recordWorkerStep({
    auditId: created.audit.id,
    runId,
    stepIndex: 1,
    action: "goto",
    status: "passed",
    thought: "Open pricing.",
    result: "Pricing page loaded.",
    url: "https://stripe.com/pricing"
  });

  const oldStart = new Date(Date.now() - 60_000).toISOString();
  const running = getAuditOverview(created.audit.id);
  running.runs[0]!.startedAt = oldStart;

  const finalized = finalizeTimedOutAudit(created.audit.id, {
    now: new Date(),
    personaTimeoutMs: 1,
    auditTimeoutMs: 120_000
  });

  assert.equal(finalized.status, "COMPLETED");
  assert.equal(finalized.runs[0]?.status, "TIMED_OUT");
  assert.equal(finalized.jobs?.[0]?.status, "TIMED_OUT");
  assert.equal(finalized.report?.outcome, "partial");
  assert.equal(finalized.issues.some((issue) => issue.category === "Execution timeout"), true);
});

test("worker callbacks are idempotent for duplicate steps and terminal completions", () => {
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

  const firstStep = recordWorkerStep({
    auditId: created.audit.id,
    runId,
    stepIndex: 1,
    action: "goto",
    status: "passed",
    thought: "Open demo.",
    result: "Demo loaded.",
    screenshotBase64: "ZmFrZS1wbmc=",
    url: `${baseUrl}/demo-target`
  });
  const duplicateStep = recordWorkerStep({
    auditId: created.audit.id,
    runId,
    stepIndex: 1,
    action: "goto",
    status: "passed",
    thought: "Open demo.",
    result: "Demo loaded.",
    screenshotBase64: "ZmFrZS1wbmc=",
    url: `${baseUrl}/demo-target`
  });

  assert.equal(duplicateStep.id, firstStep.id);
  assert.equal(getAuditOverview(created.audit.id).runs[0]?.steps?.length, 1);

  const completion = {
    auditId: created.audit.id,
    runId,
    success: false,
    status: "FAILED" as const,
    summary: "Worker crashed after the first evidence frame.",
    issues: [{
      severity: "MEDIUM" as const,
      category: "Worker crash",
      title: "Browser worker crashed before finishing",
      description: "The worker reported a crash and the callback was retried.",
      evidenceStepIds: [firstStep.id],
      suggestedFix: "Retry after checking worker logs."
    }]
  };

  const firstComplete = completeWorkerRun(completion);
  const duplicateComplete = completeWorkerRun(completion);

  assert.equal(firstComplete.issues.filter((issue) => issue.category === "Worker crash").length, 1);
  assert.equal(duplicateComplete.issues.filter((issue) => issue.category === "Worker crash").length, 1);
  assert.equal(duplicateComplete.report?.outcome, "partial");
});

test("polling event payload is capped while preserving latest worker state", () => {
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

  for (let index = 1; index <= 118; index += 1) {
    recordWorkerStep({
      auditId: created.audit.id,
      runId,
      stepIndex: index,
      action: "observe",
      status: "passed",
      thought: "Observe safe public state.",
      result: `Evidence step ${index}.`,
      url: `${baseUrl}/demo-target`
    });
  }

  const events = getAuditEvents(created.audit.id);
  assert.equal(events.runs[0]?.steps?.length, 10);
  assert.equal(events.runs[0]?.steps?.at(-1)?.stepIndex, 118);
  assert.equal(events.eventCount && events.eventCount > events.events.length, true);
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

test("persistence config selects memory, postgres, and Supabase REST adapters", () => {
  const previous = {
    DATABASE_URL: process.env.DATABASE_URL,
    SWARMPROOF_PERSISTENCE: process.env.SWARMPROOF_PERSISTENCE,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY
  };

  try {
    delete process.env.DATABASE_URL;
    delete process.env.SWARMPROOF_PERSISTENCE;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    assert.equal(getPersistenceConfig().mode, "memory");
    assert.equal(getDatabaseStatus().activeAdapter, "memory");

    process.env.DATABASE_URL = "postgresql://swarmproof:secret@db.example.com:5432/postgres";
    assert.equal(getPersistenceConfig().mode, "postgres");
    assert.equal(getDatabaseStatus().activeAdapter, "postgres");

    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
    assert.equal(getPersistenceConfig().mode, "supabase-rest");
    assert.equal(getDatabaseStatus().activeAdapter, "supabase-rest");

    process.env.SWARMPROOF_PERSISTENCE = "postgres";
    assert.equal(getPersistenceConfig().mode, "postgres");
    assert.equal(getDatabaseStatus().activeAdapter, "postgres");
  } finally {
    restoreEnvValue("DATABASE_URL", previous.DATABASE_URL);
    restoreEnvValue("SWARMPROOF_PERSISTENCE", previous.SWARMPROOF_PERSISTENCE);
    restoreEnvValue("NEXT_PUBLIC_SUPABASE_URL", previous.NEXT_PUBLIC_SUPABASE_URL);
    restoreEnvValue("SUPABASE_URL", previous.SUPABASE_URL);
    restoreEnvValue("SUPABASE_SERVICE_ROLE_KEY", previous.SUPABASE_SERVICE_ROLE_KEY);
  }
});

function restoreEnvValue(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
