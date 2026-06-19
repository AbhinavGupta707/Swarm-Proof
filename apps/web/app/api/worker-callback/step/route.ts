import { recordWorkerStepAsync } from "@swarmproof/db";
import type { WorkerStepCallback } from "@swarmproof/types";
import { handleApiError, ok, readJson } from "../../_lib";
import type { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await readJson(request) as WorkerStepCallback;
    return ok(await recordWorkerStepAsync(body));
  } catch (error) {
    return handleApiError(error);
  }
}
