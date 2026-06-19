"use client";

import { useEffect } from "react";
import { trackEvent, type EventName, type SafeEventProps } from "@swarmproof/events";

export function TrackPageEvent({ name, props }: { name: EventName; props?: SafeEventProps }) {
  useEffect(() => {
    trackEvent(name, props);
  }, [name, props]);

  return null;
}
