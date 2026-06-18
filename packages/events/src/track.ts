import type { EventName } from "./event-names";

type SafeEventProps = Record<string, string | number | boolean | null | undefined>;

export function trackEvent(name: EventName, props: SafeEventProps = {}) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent("swarmproof:event", { detail: { name, props } }));
}
