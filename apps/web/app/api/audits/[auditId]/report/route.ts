import { generateAuditReportAsync, getAuditOverviewAsync } from "@swarmproof/db";
import { handleApiError, ok } from "../../../_lib";

type RouteContext = { params: Promise<{ auditId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { auditId } = await context.params;
    const audit = await getAuditOverviewAsync(auditId);
    return ok(audit.report ?? await generateAuditReportAsync(auditId));
  } catch (error) {
    return handleApiError(error);
  }
}
