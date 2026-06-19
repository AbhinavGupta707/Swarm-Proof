import { completeWorkerRun } from "@swarmproof/db";
import type { WorkerCompleteCallback } from "@swarmproof/types";
import { handleApiError, ok, readJson } from "../../_lib";
import { pendoTrackServer } from "@/lib/pendo-track";
import type { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await readJson(request) as WorkerCompleteCallback;
    const result = completeWorkerRun(body);

    const completedRun = result.runs.find((r) => r.id === body.runId);
    if (body.issues && body.issues.length > 0) {
      for (const issue of body.issues) {
        pendoTrackServer("issue_detected", {
          audit_id: result.id,
          severity: issue.severity,
          category: issue.category,
          issue_count: body.issues.length,
          persona_mode: completedRun?.mode ?? "",
        });
      }
    }

    if (result.status === "COMPLETED") {
      const succeeded = result.runs.filter((r) => r.status === "SUCCEEDED").length;
      const failed = result.runs.filter((r) => r.status === "FAILED").length;
      const blocked = result.runs.filter((r) => r.status === "BLOCKED").length;
      const totalSteps = result.runs.reduce((sum, r) => sum + (r.steps?.length ?? 0), 0);
      pendoTrackServer("audit_completed", {
        audit_id: result.id,
        status: result.status,
        run_count: result.runs.length,
        succeeded_count: succeeded,
        failed_count: failed,
        blocked_count: blocked,
        issue_count: result.issues.length,
        score: result.score,
        total_steps: totalSteps,
        provider: result.provider ?? "unknown",
      });
    }

    return ok(result);
  } catch (error) {
    return handleApiError(error);
  }
}
