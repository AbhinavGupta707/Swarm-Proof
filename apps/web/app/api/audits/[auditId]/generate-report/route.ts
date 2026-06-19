import { generateAuditReport } from "@swarmproof/db";
import { handleApiError, ok } from "../../../_lib";

type RouteContext = { params: Promise<{ auditId: string }> };

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { auditId } = await context.params;
    const report = generateAuditReport(auditId);
    return ok({ reportId: report.id, report });
  } catch (error) {
    return handleApiError(error);
  }
}
