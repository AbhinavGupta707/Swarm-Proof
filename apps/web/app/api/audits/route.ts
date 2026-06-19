import { createAudit } from "@swarmproof/db";
import { fail, getBaseUrl, handleApiError, ok, readJson } from "../_lib";
import type { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await readJson(request);
    const targetUrl = typeof body.targetUrl === "string" ? body.targetUrl : "";
    const goal = typeof body.goal === "string" ? body.goal : "";
    const modes = Array.isArray(body.modes) ? body.modes.filter((mode: unknown): mode is string => typeof mode === "string") : undefined;
    const maxSteps = typeof body.maxSteps === "number" ? body.maxSteps : Number(body.maxSteps ?? 15);

    if (!targetUrl.trim()) {
      return fail("bad_request", "targetUrl is required.");
    }

    const result = createAudit({ targetUrl, goal, modes, maxSteps, baseUrl: getBaseUrl(request) });
    if (!result.ok) {
      return fail("unsafe_target_url", result.error, 400);
    }

    return ok({ auditId: result.audit.id, audit: result.audit });
  } catch (error) {
    return handleApiError(error);
  }
}
