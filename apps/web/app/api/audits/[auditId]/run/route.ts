import { startAuditRun } from "@swarmproof/db";
import { handleApiError, ok } from "../../../_lib";

type RouteContext = { params: Promise<{ auditId: string }> };

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { auditId } = await context.params;
    return ok({ runIds: startAuditRun(auditId) });
  } catch (error) {
    return handleApiError(error);
  }
}
