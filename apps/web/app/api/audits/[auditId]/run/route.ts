import { blockWorkerAuditRunAsync, getAuditOverviewAsync, startAuditRunAsync, startWorkerAuditRunAsync } from "@swarmproof/db";
import type { WorkerHealthSummary, WorkerRunAgentRequest } from "@swarmproof/types";
import { getBaseUrl, handleApiError, ok } from "../../../_lib";
import type { NextRequest } from "next/server";

type RouteContext = { params: Promise<{ auditId: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { auditId } = await context.params;
    const workerBaseUrl = process.env.BROWSER_WORKER_URL?.replace(/\/$/, "");

    if (!workerBaseUrl) {
      return ok({
        runIds: await startAuditRunAsync(auditId),
        dispatched: false,
        provider: "deterministic-demo",
        fallbackReason: "BROWSER_WORKER_URL is not configured."
      });
    }

    const health = await getWorkerHealth(workerBaseUrl);
    if (!health.ok) {
      return ok({
        runIds: await startAuditRunAsync(auditId),
        dispatched: false,
        provider: "deterministic-demo",
        fallbackReason: health.error
      });
    }

    if (health.data.provider !== "local-playwright") {
      return ok({
        runIds: await startAuditRunAsync(auditId),
        dispatched: false,
        provider: health.data.provider,
        fallbackReason: "Worker is healthy but not running the local-playwright provider."
      });
    }

    const plan = await startWorkerAuditRunAsync(auditId, getBaseUrl(request));
    try {
      await Promise.all(plan.requests.map((payload) => dispatchRun(workerBaseUrl, payload)));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Worker dispatch failed.";
      await blockWorkerAuditRunAsync(auditId, message);
      return ok({
        runIds: plan.runIds,
        dispatched: false,
        provider: health.data.provider,
        fallbackReason: message
      });
    }

    return ok({
      runIds: plan.runIds,
      dispatched: plan.requests.length > 0,
      provider: health.data.provider,
      audit: await getAuditOverviewAsync(auditId)
    });
  } catch (error) {
    return handleApiError(error);
  }
}

async function getWorkerHealth(workerBaseUrl: string): Promise<{ ok: true; data: WorkerHealthSummary } | { ok: false; error: string }> {
  try {
    const response = await fetch(`${workerBaseUrl}/health`, { cache: "no-store" });
    if (!response.ok) {
      return { ok: false, error: `Worker health check failed with ${response.status}.` };
    }

    const payload = await response.json() as { ok?: boolean; data?: WorkerHealthSummary; error?: { message?: string } };
    if (!payload.ok || !payload.data) {
      return { ok: false, error: payload.error?.message ?? "Worker health payload was invalid." };
    }

    return { ok: true, data: payload.data };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Worker health check failed." };
  }
}

async function dispatchRun(workerBaseUrl: string, payload: WorkerRunAgentRequest) {
  const response = await fetch(`${workerBaseUrl}/worker/run-agent`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Worker rejected run ${payload.runId} with ${response.status}.`);
  }

  const body = await response.json() as { ok?: boolean; error?: { message?: string } };
  if (!body.ok) {
    throw new Error(body.error?.message ?? `Worker rejected run ${payload.runId}.`);
  }
}
