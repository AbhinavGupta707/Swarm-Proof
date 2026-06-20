import test from "node:test";
import assert from "node:assert/strict";
import { Events } from "./event-names";
import { isAgentEvent, sanitizeEventProps } from "./track";

test("event sanitizer keeps safe scalar props and drops sensitive analytics fields", () => {
  const sanitized = sanitizeEventProps({
    target_kind: "public",
    persona_count: 3,
    ok: true,
    routeUrl: "https://example.com/private",
    rawContent: "hidden copy",
    screenshotBase64: "abc",
    accessToken: "secret",
    email: "person@example.com",
    nested: undefined
  });

  assert.deepEqual(sanitized, {
    target_kind: "public",
    persona_count: 3,
    ok: true
  });
});

test("agent event classifier routes persona and browser-step events to the agent channel", () => {
  assert.equal(isAgentEvent(Events.AgentRunStarted), true);
  assert.equal(isAgentEvent(Events.BrowserStepCompleted), true);
  assert.equal(isAgentEvent(Events.RunCompleted), true);
  assert.equal(isAgentEvent(Events.ReportGenerated), false);
  assert.equal(isAgentEvent(Events.ShareCreated), false);
});
