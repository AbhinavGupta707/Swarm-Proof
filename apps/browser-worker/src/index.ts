import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { defaultPersonas, type WorkerCompleteCallback, type WorkerRunAgentRequest, type WorkerStepCallback } from "@swarmproof/types";

const port = Number(process.env.PORT ?? 8787);

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

    if (request.method === "GET" && url.pathname === "/health") {
      return sendJson(response, 200, {
        ok: true,
        data: {
          service: "swarmproof-browser-worker",
          provider: process.env.FIREWORKS_API_KEY ? "fireworks-ready" : "deterministic-demo",
          personas: defaultPersonas.map((persona) => persona.mode)
        }
      });
    }

    if (request.method === "POST" && url.pathname === "/worker/run-agent") {
      const body = await readJson<WorkerRunAgentRequest>(request);
      queueDeterministicRun(body);
      return sendJson(response, 202, { ok: true, data: { accepted: true, provider: "deterministic-demo" } });
    }

    return sendJson(response, 404, { ok: false, error: { code: "not_found", message: "Worker route not found." } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected worker error.";
    return sendJson(response, 500, { ok: false, error: { code: "worker_error", message } });
  }
});

server.listen(port, () => {
  console.log(`SwarmProof browser worker listening on http://localhost:${port}`);
  console.log(`Registered personas: ${defaultPersonas.map((persona) => persona.mode).join(", ")}`);
});

function queueDeterministicRun(input: WorkerRunAgentRequest) {
  setTimeout(() => {
    runDeterministicAgent(input).catch((error) => {
      console.error("deterministic worker run failed", error);
    });
  }, 0);
}

async function runDeterministicAgent(input: WorkerRunAgentRequest) {
  const steps = stepsFor(input);
  for (const step of steps) {
    await postCallback(`${input.callbackBaseUrl}/api/worker-callback/step`, step);
  }

  await postCallback(`${input.callbackBaseUrl}/api/worker-callback/complete`, completeFor(input, steps));
}

function stepsFor(input: WorkerRunAgentRequest): WorkerStepCallback[] {
  const mode = input.persona.mode;
  const base = input.targetUrl;

  if (mode === "mobile") {
    return [
      step(input.runId, 1, "goto", "Open the target on a mobile viewport.", "Demo target loaded.", base),
      step(input.runId, 2, "click_text", "Start signup.", "Signup panel opened.", `${base}/signup`),
      step(input.runId, 3, "inspect_viewport", "Find primary action.", "Create account CTA is below the visible mobile fold.", `${base}/signup`)
    ];
  }

  if (mode === "chaos") {
    return [
      step(input.runId, 1, "goto", "Open signup quickly.", "Signup accepted demo credentials.", `${base}/signup`),
      step(input.runId, 2, "double_click_text", "Double-click create project.", "Two duplicate projects appeared.", `${base}/projects/new`),
      step(input.runId, 3, "fill_label", "Try invalid teammate email.", "Invite form produced a vague error.", `${base}/invite`)
    ];
  }

  return [
    step(input.runId, 1, "goto", "Open the product.", "Demo landing page loaded.", base),
    step(input.runId, 2, "click_text", "Create a project.", "Project creation path opened.", `${base}/projects/new`),
    step(input.runId, 3, "find_invite", "Find invite teammate action.", "Invite action is labeled Add people and is easy to miss.", `${base}/invite`)
  ];
}

function completeFor(input: WorkerRunAgentRequest, steps: WorkerStepCallback[]): WorkerCompleteCallback {
  const mode = input.persona.mode;
  const evidenceStepIds = steps.map((item) => `${input.runId}:${item.stepIndex}`);

  if (mode === "mobile") {
    return {
      runId: input.runId,
      success: false,
      status: "FAILED",
      summary: "Mobile signup exposes the hidden CTA bug.",
      issues: [{
        severity: "HIGH",
        category: "Mobile UX",
        title: "Signup CTA is hidden on mobile",
        description: "The fixed-height signup panel hides the submit action below the fold.",
        evidenceStepIds,
        suggestedFix: "Move the primary action into a sticky footer or let the panel scroll."
      }]
    };
  }

  if (mode === "chaos") {
    return {
      runId: input.runId,
      success: false,
      status: "FAILED",
      summary: "Chaos input found duplicate project creation.",
      issues: [{
        severity: "MEDIUM",
        category: "Form handling",
        title: "Double submit creates duplicate projects",
        description: "The create project button stays active while the request is pending.",
        evidenceStepIds,
        suggestedFix: "Disable submit while pending and make creation idempotent."
      }]
    };
  }

  return {
    runId: input.runId,
    success: false,
    status: "BLOCKED",
    summary: "The invite teammate CTA is ambiguous.",
    issues: [{
      severity: "MEDIUM",
      category: "Information architecture",
      title: "Invite teammate CTA is hard to recognize",
      description: "The page uses Add people while the user goal is to invite a teammate.",
      evidenceStepIds,
      suggestedFix: "Rename the primary action to Invite teammate."
    }]
  };
}

function step(runId: string, stepIndex: number, action: string, thought: string, result: string, url: string): WorkerStepCallback {
  return { runId, stepIndex, action, thought, result, url, screenshotUrl: frameUrl(action, result) };
}

async function postCallback(url: string, body: WorkerStepCallback | WorkerCompleteCallback) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`Callback failed: ${response.status} ${response.statusText}`);
  }
}

async function readJson<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
}

function sendJson(response: ServerResponse, status: number, payload: unknown) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(payload));
}

function frameUrl(action: string, result: string) {
  const text = `${action}: ${result}`.slice(0, 90);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540"><rect width="960" height="540" fill="#eef4f1"/><rect x="44" y="52" width="872" height="436" rx="16" fill="#fff" stroke="#c9d6d1"/><text x="84" y="150" font-family="Arial" font-size="28" font-weight="700" fill="#10201b">Worker evidence frame</text><text x="84" y="218" font-family="Arial" font-size="20" fill="#3f5f55">${escapeXml(text)}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char] ?? char);
}
