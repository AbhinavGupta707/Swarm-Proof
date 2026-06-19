import { appendEvent } from "@swarmproof/db";
import { ok, readJson } from "../_lib";
import type { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const body = await readJson(request);
  const name = typeof body.name === "string" ? body.name : "custom_event";
  const auditId = typeof body.auditId === "string" ? body.auditId : undefined;
  const props = typeof body.props === "object" && body.props !== null ? body.props as Record<string, unknown> : {};
  return ok(appendEvent(name, auditId, props));
}
