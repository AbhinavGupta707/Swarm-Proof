import { createShare, getAuditOverview } from "@swarmproof/db";
import { getBaseUrl, handleApiError, ok } from "../../../_lib";
import { pendoTrackServer } from "@/lib/pendo-track";
import type { NextRequest } from "next/server";

type RouteContext = { params: Promise<{ auditId: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { auditId } = await context.params;
    const result = createShare(auditId, getBaseUrl(request));
    const audit = getAuditOverview(auditId);

    pendoTrackServer("share_created", {
      audit_id: auditId,
      share_token: result.shareToken,
      public_report: true,
      score: audit.score,
      issue_count: audit.issues.length,
    });

    return ok(result);
  } catch (error) {
    return handleApiError(error);
  }
}
