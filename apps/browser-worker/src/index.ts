import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { defaultPersonas, type WorkerCompleteCallback, type WorkerHealthSummary, type WorkerRunAgentRequest, type WorkerStepCallback } from "@swarmproof/types";
import { runDeterministicAgent, type CallbackPoster } from "./deterministic-runner";
import { isPlaywrightPackageAvailable, runLocalPlaywrightAgent } from "./local-playwright";

const port = Number(process.env.PORT ?? 8787);

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

    if (request.method === "GET" && url.pathname === "/health") {
      return sendJson(response, 200, {
        ok: true,
        data: workerHealth()
      });
    }

    if (request.method === "POST" && url.pathname === "/worker/run-agent") {
      const body = await readJson<WorkerRunAgentRequest>(request);
      queueWorkerRun(body);
      return sendJson(response, 202, {
        ok: true,
        data: {
          accepted: true,
          provider: activeProvider(),
          runMode: body.runMode ?? "external-public"
        }
      });
    }

    return sendJson(response, 404, { ok: false, error: { code: "not_found", message: "Worker route not found." } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected worker error.";
    return sendJson(response, 500, { ok: false, error: { code: "worker_error", message } });
  }
});

server.listen(port, () => {
  console.log(`SwarmProof browser worker listening on http://localhost:${port}`);
  console.log(`Provider: ${activeProvider()}`);
  console.log(`Registered personas: ${defaultPersonas.map((persona) => persona.mode).join(", ")}`);
});

function queueWorkerRun(input: WorkerRunAgentRequest) {
  setTimeout(() => {
    runWorker(input).catch((error) => {
      console.error("worker run failed", error);
    });
  }, 0);
}

async function runWorker(input: WorkerRunAgentRequest) {
  const postCallback = callbackPoster(input.callbackBaseUrl);

  if (activeProvider() === "local-playwright") {
    try {
      await runLocalPlaywrightAgent(input, postCallback);
      return;
    } catch (error) {
      console.error("local Playwright run failed, falling back to deterministic runner", error);
      await postCallback("step", {
        runId: input.runId,
        stepIndex: 0,
        action: "worker_fallback",
        status: "warning",
        thought: "The local Playwright provider failed before completing the run.",
        result: error instanceof Error ? error.message : "Unknown Playwright provider error."
      });
    }
  }

  await runDeterministicAgent(input, postCallback);
}

function workerHealth(): WorkerHealthSummary {
  return {
    service: "swarmproof-browser-worker",
    provider: activeProvider(),
    playwrightAvailable: isPlaywrightPackageAvailable(),
    personas: defaultPersonas.map((persona) => persona.mode)
  };
}

function activeProvider(): WorkerHealthSummary["provider"] {
  return process.env.BROWSER_PROVIDER === "local-playwright" ? "local-playwright" : "deterministic-demo";
}

function callbackPoster(callbackBaseUrl: string): CallbackPoster {
  const base = callbackBaseUrl.replace(/\/$/, "");

  return async <T>(path: "step" | "complete", body: WorkerStepCallback | WorkerCompleteCallback) => {
    return postCallback<T>(`${base}/api/worker-callback/${path}`, body);
  };
}

async function postCallback<T>(url: string, body: WorkerStepCallback | WorkerCompleteCallback): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`Callback failed: ${response.status} ${response.statusText}`);
  }

  const payload = await response.json() as { ok?: boolean; data?: T; error?: { message?: string } };
  if (!payload.ok) {
    throw new Error(payload.error?.message ?? "Callback failed.");
  }

  return payload.data as T;
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
