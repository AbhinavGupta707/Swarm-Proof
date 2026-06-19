import { completeWorkerRun } from "@swarmproof/db";
import type { WorkerCompleteCallback } from "@swarmproof/types";
import { handleApiError, ok, readJson } from "../../_lib";
import type { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await readJson(request) as WorkerCompleteCallback;
    return ok(completeWorkerRun(body));
  } catch (error) {
    return handleApiError(error);
  }
}
