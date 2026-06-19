import { runPreflight } from "@swarmproof/db";
import { handleApiError, ok } from "../../../_lib";
import { pendoTrackServer } from "@/lib/pendo-track";

type RouteContext = { params: Promise<{ auditId: string }> };

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { auditId } = await context.params;
    const result = runPreflight(auditId);

    pendoTrackServer("preflight_completed", {
      audit_id: auditId,
      is_demo_target: result.isDemoTarget,
      is_safe: result.loadable,
      target_kind: result.isDemoTarget ? "demo" : "custom",
    });

    return ok(result);
  } catch (error) {
    return handleApiError(error);
  }
}
