import type { EventName } from "./event-names";
import { Events } from "./event-names";

export type SafeEventProps = Record<string, string | number | boolean | null | undefined>;
export type SwarmProofEventDetail = { name: EventName; props?: SafeEventProps };

const UNSAFE_PROP_KEYS = ["url", "content", "screenshot", "secret", "token", "password", "email", "credential"];
const AGENT_EVENT_NAMES = new Set<EventName>([
  Events.AgentRunStarted,
  Events.BrowserStepCompleted,
  Events.PersonaBlocked,
  Events.PersonaFailed,
  Events.PersonaTimedOut,
  Events.RunCompleted
]);

declare global {
  interface Window {
    __swarmproofEventBridgeReady?: boolean;
    __swarmproofPendingEvents?: SwarmProofEventDetail[];
  }
}

export function trackEvent(name: EventName, props: SafeEventProps = {}) {
  if (typeof window === "undefined") {
    return;
  }

  const detail = { name, props: sanitizeEventProps(props) };
  if (!window.__swarmproofEventBridgeReady) {
    window.__swarmproofPendingEvents = [...(window.__swarmproofPendingEvents ?? []), detail];
  }

  window.dispatchEvent(new CustomEvent("swarmproof:event", { detail }));
}

export function sanitizeEventProps(props: SafeEventProps = {}) {
  const safeProps: SafeEventProps = {};

  for (const [key, value] of Object.entries(props)) {
    const lowerKey = key.toLowerCase();
    if (UNSAFE_PROP_KEYS.some((unsafeKey) => lowerKey.includes(unsafeKey))) {
      continue;
    }

    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) {
      safeProps[key] = value;
    }
  }

  return safeProps;
}

export function isAgentEvent(name: EventName) {
  return AGENT_EVENT_NAMES.has(name);
}
