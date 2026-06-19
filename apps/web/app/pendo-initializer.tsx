"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { sanitizeEventProps, type EventName, type SafeEventProps } from "@swarmproof/events";

type SwarmProofEvent = CustomEvent<{ name: EventName; props?: SafeEventProps }>;

const VISITOR_ID_KEY = "swarmproof:anonymousVisitorId";

export default function PendoInitializer() {
  const pathname = usePathname();
  const initialized = useRef(false);

  useEffect(() => {
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      if (initializePendo(initialized) || attempts >= 20) {
        window.clearInterval(timer);
      }
    }, 250);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    window.pendo?.pageLoad?.();
  }, [pathname]);

  useEffect(() => {
    function handleSwarmProofEvent(event: Event) {
      const detail = (event as SwarmProofEvent).detail;
      if (!detail?.name) {
        return;
      }

      window.pendo?.track?.(detail.name, sanitizeEventProps(detail.props));
    }

    window.addEventListener("swarmproof:event", handleSwarmProofEvent);
    return () => window.removeEventListener("swarmproof:event", handleSwarmProofEvent);
  }, []);

  return null;
}

function initializePendo(initialized: { current: boolean }) {
  if (initialized.current) {
    return true;
  }

  const pendo = window.pendo;
  if (!pendo?.initialize) {
    return false;
  }

  pendo.initialize({
    visitor: {
      id: getAnonymousVisitorId(),
      app: "swarmproof",
      visitor_type: "anonymous"
    }
  });
  initialized.current = true;
  return true;
}

function getAnonymousVisitorId() {
  try {
    const existing = window.localStorage.getItem(VISITOR_ID_KEY);
    if (existing) {
      return existing;
    }

    const generated = `anon_${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(VISITOR_ID_KEY, generated);
    return generated;
  } catch {
    return "anon_no_storage";
  }
}
