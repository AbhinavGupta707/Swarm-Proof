import { generateAuditReport, getAuditOverview } from "@swarmproof/db";
import { handleApiError, ok } from "../../../_lib";
import { pendoTrackServer } from "@/lib/pendo-track";

type RouteContext = { params: Promise<{ auditId: string }> };

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { auditId } = await context.params;
    const report = generateAuditReport(auditId);
    const audit = getAuditOverview(auditId);

    pendoTrackServer("report_generated", {
      audit_id: auditId,
      score: report.score,
      issue_count: report.reportJson.issues.length,
      run_count: audit.runs.length,
      outcome: report.outcome,
      has_generated_test: report.reportJson.playwrightTests.length > 0,
    });

    return ok({ reportId: report.id, report });
  } catch (error) {
    return handleApiError(error);
  }
}
