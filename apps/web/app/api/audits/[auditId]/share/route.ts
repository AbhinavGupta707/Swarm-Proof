import { createShare } from "@swarmproof/db";
import { getBaseUrl, handleApiError, ok } from "../../../_lib";
import type { NextRequest } from "next/server";

type RouteContext = { params: Promise<{ auditId: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { auditId } = await context.params;
    return ok(createShare(auditId, getBaseUrl(request)));
  } catch (error) {
    return handleApiError(error);
  }
}
