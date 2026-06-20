"use client";

import { useEffect } from "react";
import { type EventName, type SafeEventProps } from "@swarmproof/events";

export function TrackPageEvent({ name, props }: { name: EventName; props?: SafeEventProps }) {
  useEffect(() => {
    window.pendo?.track?.(name, props);
  }, [name, props]);

  return null;
}
