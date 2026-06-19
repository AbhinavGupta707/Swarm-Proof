import { recordWorkerStep } from "@swarmproof/db";
import type { WorkerStepCallback } from "@swarmproof/types";
import { handleApiError, ok, readJson } from "../../_lib";
import { pendoTrackServer } from "@/lib/pendo-track";
import type { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await readJson(request) as WorkerStepCallback;
    const step = recordWorkerStep(body);

    pendoTrackServer("browser_step_completed", {
      run_id: step.runId,
      step_index: step.stepIndex,
      status: step.status ?? "passed",
      action_type: step.action,
    });

    return ok(step);
  } catch (error) {
    return handleApiError(error);
  }
}
