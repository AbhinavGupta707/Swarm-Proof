import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { defaultPersonas, type WorkerCompleteCallback, type WorkerHealthSummary, type WorkerRunAgentRequest, type WorkerStepCallback } from "@swarmproof/types";
import { runDeterministicAgent, type CallbackPoster } from "./deterministic-runner";
import { isPlaywrightPackageAvailable, runLocalPlaywrightAgent } from "./local-playwright";

const port = Number(process.env.PORT ?? 8787);
const queuedRuns: WorkerRunAgentRequest[] = [];
let activeRunCount = 0;

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
  console.log(`AI planner configured: ${Boolean(process.env.FIREWORKS_API_KEY)} (${fireworksModel()})`);
  console.log(`AI verifier configured: ${Boolean(process.env.FIREWORKS_API_KEY)} (${fireworksModel()})`);
  console.log("Goal compiler: deterministic");
  console.log(`Registered personas: ${defaultPersonas.map((persona) => persona.mode).join(", ")}`);
});

function queueWorkerRun(input: WorkerRunAgentRequest) {
  queuedRuns.push(input);
  void drainWorkerQueue();
}

async function drainWorkerQueue() {
  while (activeRunCount < workerConcurrency()) {
    const next = queuedRuns.shift();
    if (!next) {
      return;
    }

    activeRunCount += 1;
    void runQueuedWorker(next)
      .catch((error) => {
        console.error("worker run failed", error);
      })
      .finally(() => {
        activeRunCount = Math.max(0, activeRunCount - 1);
        void drainWorkerQueue();
      });
  }
}

async function runQueuedWorker(input: WorkerRunAgentRequest) {
  const postCallback = callbackPoster(input.callbackBaseUrl);
  try {
    await withTimeout(runWorker(input, postCallback), workerTimeoutMs(input), new WorkerTimeoutError("Worker persona timeout elapsed."));
  } catch (error) {
    await completeAfterWorkerError(input, postCallback, error);
  }
}

async function runWorker(input: WorkerRunAgentRequest, postCallback: CallbackPoster) {
  if (activeProvider() === "local-playwright") {
    try {
      await runLocalPlaywrightAgent(input, postCallback);
      return;
    } catch (error) {
      console.error("local Playwright run failed", error);
      await postCallback("step", {
        auditId: input.auditId,
        runId: input.runId,
        stepIndex: input.maxSteps + 1,
        action: "worker_crash",
        status: "failed",
        thought: "The local Playwright provider failed before completing the run.",
        result: safeWorkerError(error)
      });

      if (input.runMode === "demo-target") {
        await runDeterministicAgent(input, postCallback);
        return;
      }

      throw error;
    }
  }

  await runDeterministicAgent(input, postCallback);
}

function workerHealth(): WorkerHealthSummary {
  return {
    service: "swarmproof-browser-worker",
    provider: activeProvider(),
    playwrightAvailable: isPlaywrightPackageAvailable(),
    aiPlannerConfigured: Boolean(process.env.FIREWORKS_API_KEY),
    aiVerifierConfigured: Boolean(process.env.FIREWORKS_API_KEY),
    aiModel: fireworksModel(),
    goalCompiler: "deterministic",
    personas: defaultPersonas.map((persona) => persona.mode),
    queueDepth: queuedRuns.length,
    activeRuns: activeRunCount
  };
}

function activeProvider(): WorkerHealthSummary["provider"] {
  return process.env.BROWSER_PROVIDER === "local-playwright" ? "local-playwright" : "deterministic-demo";
}

function fireworksModel() {
  return process.env.FIREWORKS_MODEL ?? "accounts/fireworks/models/deepseek-v3p1";
}

function callbackPoster(callbackBaseUrl: string): CallbackPoster {
  const base = callbackBaseUrl.replace(/\/$/, "");

  return async <T>(path: "step" | "complete", body: WorkerStepCallback | WorkerCompleteCallback) => {
    return postCallbackWithRetry<T>(`${base}/api/worker-callback/${path}`, body);
  };
}

async function postCallbackWithRetry<T>(url: string, body: WorkerStepCallback | WorkerCompleteCallback): Promise<T> {
  const attempts = Math.max(1, Number(process.env.WORKER_CALLBACK_RETRIES ?? 4));
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await postCallback<T>(url, body);
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) {
        await delay(250 * 2 ** attempt);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Callback failed after retries.");
}

async function postCallback<T>(url: string, body: WorkerStepCallback | WorkerCompleteCallback): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1_000, Number(process.env.WORKER_CALLBACK_TIMEOUT_MS ?? 8_000)));
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`Callback failed: ${response.status} ${response.statusText}`);
  }

  const payload = await response.json() as { ok?: boolean; data?: T; error?: { message?: string } };
  if (!payload.ok) {
    throw new Error(payload.error?.message ?? "Callback failed.");
  }

  return payload.data as T;
}

async function completeAfterWorkerError(input: WorkerRunAgentRequest, postCallback: CallbackPoster, error: unknown) {
  const errorMessage = safeWorkerError(error);
  const timedOut = error instanceof WorkerTimeoutError || /persona timeout|timeout elapsed/i.test(errorMessage);
  try {
    await postCallback("complete", {
      auditId: input.auditId,
      runId: input.runId,
      success: false,
      status: timedOut ? "TIMED_OUT" : "FAILED",
      summary: timedOut
        ? "The browser worker hit its persona timeout. Partial evidence is ready."
        : "The browser worker crashed before it could finish. Partial evidence is ready.",
      issues: [{
        severity: "MEDIUM",
        category: timedOut ? "Execution timeout" : "Worker crash",
        title: timedOut ? "Browser worker timed out before finishing" : "Browser worker crashed before finishing",
        description: timedOut
          ? "The Railway worker exceeded the persona budget and finalized the run with partial evidence."
          : `The Railway worker failed during live browser execution: ${errorMessage}`,
        suggestedFix: timedOut
          ? "Retry the persona after checking worker health and target page weight."
          : "Check worker logs, Playwright crash reasons, and callback health before retrying."
      }]
    });
  } catch (callbackError) {
    console.error("failed to post terminal worker callback", callbackError);
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutError: Error): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const guarded = promise.finally(() => {
    if (timer) clearTimeout(timer);
  });
  guarded.catch(() => undefined);
  return Promise.race([
    guarded,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(timeoutError), timeoutMs);
    })
  ]);
}

function workerTimeoutMs(input: WorkerRunAgentRequest) {
  const fallback = input.runMode === "demo-target" ? 45_000 : 75_000;
  const requested = Number(input.timeoutMs ?? process.env.WORKER_PERSONA_TIMEOUT_MS ?? fallback);
  return Number.isFinite(requested) && requested > 0 ? requested : fallback;
}

function workerConcurrency() {
  const requested = Number(process.env.WORKER_CONCURRENCY ?? 1);
  if (!Number.isFinite(requested)) return 1;
  return Math.max(1, Math.min(3, Math.floor(requested)));
}

function safeWorkerError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown Playwright provider error.";
  return message
    .replace(/https?:\/\/[^\s)]+/g, "[redacted-url]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 260);
}

class WorkerTimeoutError extends Error {}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
