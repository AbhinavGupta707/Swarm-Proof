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
  return Boolean(commitmentStopReason(label));
}

export function commitmentStopReason(label: string) {
  const normalized = label.replace(/\s+/g, " ").trim();
  if (!normalized) return undefined;

  if (/\b(add to bag|add to cart|add bag|add cart)\b/i.test(normalized)) {
    return "Adding an item to a cart or bag is a purchase-commitment boundary.";
  }

  if (/\b(checkout|place order|submit order|complete order|pay|payment|confirm|confirm purchase|confirm order)\b/i.test(normalized)) {
    return "Checkout, payment, order, or confirmation actions are blocked.";
  }

  if (/\b(subscribe|start subscription|book|reserve|delete|remove|destroy|logout|log out|sign out)\b/i.test(normalized)) {
    return "Subscription, booking, destructive, or account-exit actions are blocked.";
  }

  return undefined;
}

export function isLikelyAuthWall(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return false;

  if (/\b(password|passcode)\b/i.test(normalized) && /\b(sign in|log in|login|authenticate|continue|account)\b/i.test(normalized)) {
    return true;
  }

  if (/\b(captcha|recaptcha|hcaptcha|turnstile|verify you are human)\b/i.test(normalized)) {
    return true;
  }

  if (/\b(verification code|two-factor|2fa|one-time code|security code|otp)\b/i.test(normalized)) {
    return true;
  }

  if (/\b(access denied|unauthorized|authentication required|login required|sign in required|members only|private page)\b/i.test(normalized)) {
    return true;
  }

  return false;
}

export function hasStrongAuthWallSignals(signals: {
  visibleText?: string;
  passwordFieldCount?: number;
  captchaCount?: number;
  verificationFieldCount?: number;
  accessDeniedPanelCount?: number;
}) {
  return Boolean(
    (signals.passwordFieldCount ?? 0) > 0 ||
    (signals.captchaCount ?? 0) > 0 ||
    (signals.verificationFieldCount ?? 0) > 0 ||
    (signals.accessDeniedPanelCount ?? 0) > 0 ||
    isLikelyAuthWall(signals.visibleText ?? "")
  );
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
