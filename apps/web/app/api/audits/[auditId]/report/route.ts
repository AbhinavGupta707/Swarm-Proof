import { generateAuditReport, getAuditOverview } from "@swarmproof/db";
import { handleApiError, ok } from "../../../_lib";

type RouteContext = { params: Promise<{ auditId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { auditId } = await context.params;
    const audit = getAuditOverview(auditId);
    return ok(audit.report ?? generateAuditReport(auditId));
  } catch (error) {
    return handleApiError(error);
  }
}
