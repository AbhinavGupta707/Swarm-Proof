import { getAuditEventsAsync } from "@swarmproof/db";
import { handleApiError, ok } from "../../../_lib";

type RouteContext = { params: Promise<{ auditId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { auditId } = await context.params;
    return ok(await getAuditEventsAsync(auditId));
  } catch (error) {
    return handleApiError(error);
  }
}
