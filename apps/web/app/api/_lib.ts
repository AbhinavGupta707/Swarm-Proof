import { NextResponse, type NextRequest } from "next/server";

export type ApiErrorCode =
  | "bad_request"
  | "not_found"
  | "unsafe_target_url"
  | "internal_error";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, init);
}

export function fail(code: ApiErrorCode, message: string, status = 400) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
}

export async function readJson(request: NextRequest) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

export function getBaseUrl(request: NextRequest) {
  return process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
}

export function handleApiError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected API error.";
  if (message.includes("not found") || message.includes("not found")) {
    return fail("not_found", message, 404);
  }

  return fail("internal_error", message, 500);
}
