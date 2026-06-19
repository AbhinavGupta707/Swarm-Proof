import type { EventName } from "./event-names";

export type SafeEventProps = Record<string, string | number | boolean | null | undefined>;

const UNSAFE_PROP_KEYS = ["url", "content", "screenshot", "secret", "token", "password", "email", "credential"];

export function trackEvent(name: EventName, props: SafeEventProps = {}) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent("swarmproof:event", { detail: { name, props: sanitizeEventProps(props) } }));
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
