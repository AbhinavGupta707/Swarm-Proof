const PENDO_DATA_HOST = "https://data.pendo.io";
const PENDO_INTEGRATION_KEY = "c56cc5b7-a10e-4131-8452-b3943a923909";

export function pendoTrackServer(
  event: string,
  properties: Record<string, string | number | boolean> = {}
) {
  fetch(`${PENDO_DATA_HOST}/data/track`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-pendo-integration-key": PENDO_INTEGRATION_KEY,
    },
    body: JSON.stringify({
      type: "track",
      event,
      visitorId: "system",
      accountId: "system",
      timestamp: Date.now(),
      properties,
    }),
  }).catch(() => {
    // Tracking failures must not break application flow
  });
}
