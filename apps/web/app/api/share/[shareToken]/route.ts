import { getSharedReport } from "@swarmproof/db";
import { fail, ok } from "../../_lib";

type RouteContext = { params: Promise<{ shareToken: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { shareToken } = await context.params;
  const report = getSharedReport(shareToken);
  if (!report) {
    return fail("not_found", "Shared report not found.", 404);
  }

  return ok(report);
}
