export type WorkerSafetyOptions = {
  allowLocalAppOrigin?: string;
  allowLocalAppPaths?: string[];
};

export function isUnsafeWorkerUrl(rawUrl: string, options: WorkerSafetyOptions = {}) {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return true;
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return true;
  }

  if (isAllowedLocalAppUrl(parsed, options)) {
    return false;
  }

  return isPrivateOrInternalHost(parsed.hostname);
}

export function isCrossOriginNavigation(rawUrl: string, allowedOrigin: string) {
  try {
    return new URL(rawUrl).origin !== allowedOrigin;
  } catch {
    return true;
  }
}

export function shouldSkipExternalAction(label: string) {
  return /\b(delete|remove|destroy|logout|sign out|purchase|buy|checkout|pay|subscribe|confirm|book|reserve)\b/i.test(label);
}

export function isLikelyAuthWall(text: string) {
  return /\b(sign in|log in|login|password|captcha|verification code|two-factor|2fa|continue with google|payment required)\b/i.test(text);
}

function isAllowedLocalAppUrl(parsed: URL, options: WorkerSafetyOptions) {
  if (!options.allowLocalAppOrigin || parsed.origin !== options.allowLocalAppOrigin) {
    return false;
  }

  const paths = options.allowLocalAppPaths ?? [];
  return paths.length === 0 || paths.some((path) => parsed.pathname.startsWith(path));
}

function isPrivateOrInternalHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (
    host === "localhost" ||
    host === "metadata.google.internal" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    (!host.includes(".") && !host.includes(":"))
  ) {
    return true;
  }

  if (host === "::1" || host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")) {
    return true;
  }

  const parts = host.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  const [first, second] = parts;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}
