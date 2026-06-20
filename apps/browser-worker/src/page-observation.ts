import type { Page } from "playwright";
import type {
  EvidenceCandidate,
  ObservedActionCandidate,
  ObservedActionCategory,
  PageObservation,
  PageRiskSignal
} from "@swarmproof/types";

export async function observePage(page: Page, targetOrigin: string, stepId?: string): Promise<PageObservation> {
  const raw = await page.evaluate((allowedOrigin) => {
    const selector = [
      "a[href]",
      "button",
      "input",
      "textarea",
      "select",
      "[role='button']",
      "[role='link']"
    ].join(",");
    const interactiveElements = Array.from(document.querySelectorAll(selector));
    const actionCandidates = interactiveElements
      .map((element, ordinal): ObservedActionCandidate | undefined => {
        if (!isVisible(element)) return undefined;

        const tagName = element.tagName.toLowerCase();
        const role = element.getAttribute("role")?.toLowerCase();
        const input = element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
        const anchor = element as HTMLAnchorElement;
        const kind = tagName === "a" || role === "link"
          ? "link"
          : tagName === "input" || tagName === "textarea" || tagName === "select"
            ? "input"
            : "button";
        const label = labelFor(element);
        if (!label) return undefined;

        const sectionLabel = sectionFor(element);
        const nearbyText = nearbyTextFor(element, label);
        const href = kind === "link" ? anchor.href : undefined;
        let sameOrigin = true;
        if (href) {
          try {
            sameOrigin = new URL(href).origin === allowedOrigin;
          } catch {
            sameOrigin = false;
          }
        }

        return {
          kind,
          label,
          ordinal,
          href,
          sameOrigin,
          inputType: kind === "input" ? (input.getAttribute("type") ?? tagName).toLowerCase() : undefined,
          disabled: Boolean((input as HTMLInputElement).disabled || element.getAttribute("aria-disabled") === "true"),
          sectionLabel,
          nearbyText,
          category: categoryFor({ label, href, inputType: kind === "input" ? (input.getAttribute("type") ?? tagName).toLowerCase() : undefined, sectionLabel, nearbyText })
        };
      })
      .filter((candidate): candidate is ObservedActionCandidate => Boolean(candidate))
      .slice(0, 60);

    const headings = Array.from(document.querySelectorAll("h1,h2,h3,[role='heading']"))
      .filter(isVisible)
      .map((element) => textFor(element, 120))
      .filter(Boolean)
      .slice(0, 12);
    const visibleSnippets = Array.from(document.querySelectorAll("main, article, section, [role='main'], p, li"))
      .filter(isVisible)
      .map((element) => textFor(element, 180))
      .filter((text, index, all) => text.length >= 20 && all.indexOf(text) === index)
      .slice(0, 12);
    const bodyText = textFor(document.body, 2600);

    return {
      url: location.href,
      title: document.title || location.hostname,
      headings,
      visibleSnippets,
      actionCandidates,
      bodyText
    };

    function labelFor(element: Element) {
      const control = element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
      const labelledBy = element.getAttribute("aria-labelledby");
      const labelledByText = labelledBy
        ? labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? "").join(" ")
        : "";
      const explicitLabel = control.id ? document.querySelector(`label[for="${cssEscape(control.id)}"]`)?.textContent ?? "" : "";
      return clean([
        element.textContent,
        element.getAttribute("aria-label"),
        labelledByText,
        explicitLabel,
        element.getAttribute("title"),
        (control as HTMLInputElement | HTMLTextAreaElement).placeholder,
        control.name,
        control.value
      ].filter(Boolean).join(" "), 100);
    }

    function sectionFor(element: Element) {
      const section = element.closest("nav, header, main, section, article, aside, footer, [role='navigation'], [aria-label], [aria-labelledby]");
      const ariaLabel = section?.getAttribute("aria-label") ?? "";
      const labelledBy = section?.getAttribute("aria-labelledby") ?? "";
      const labelledByText = labelledBy
        ? labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? "").join(" ")
        : "";
      const heading = section?.querySelector("h1,h2,h3,[role='heading']")?.textContent ?? "";
      return clean([ariaLabel, labelledByText, heading].filter(Boolean).join(" "), 80);
    }

    function nearbyTextFor(element: Element, label: string) {
      const parentText = element.parentElement?.textContent ?? element.closest("li, article, section, div")?.textContent ?? "";
      return clean(parentText.replace(label, " "), 140);
    }

    function textFor(element: Element | undefined | null, maxLength: number) {
      return clean(element?.textContent ?? "", maxLength);
    }

    function clean(value: string, maxLength: number) {
      return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
    }

    function categoryFor(input: { label: string; href?: string; inputType?: string; sectionLabel?: string; nearbyText?: string }): ObservedActionCategory {
      const haystack = `${input.label} ${input.href ?? ""} ${input.inputType ?? ""} ${input.sectionLabel ?? ""} ${input.nearbyText ?? ""}`.toLowerCase();
      const labelOnly = input.label.toLowerCase();
      if (/\b(add to bag|add to cart|checkout|place order|pay|payment|sign up|signup|create account|start trial|free trial|try for free|start deploying|deploy now|contact sales|talk to sales|book demo|request demo|schedule demo|delete|remove|destroy|password|sso|continue with google|continue with github)\b/.test(labelOnly)) return "unsafe";
      if (/\b(log in|login|sign in|signin|account)\b/.test(haystack)) return "auth";
      if (/\b(search|query|find)\b/.test(haystack)) return "search";
      if (/\b(docs|documentation|api|sdk|install|guide|quickstart|developer)\b/.test(haystack)) return "docs";
      if (/\b(pricing|plans|cost|billing)\b/.test(haystack)) return "pricing";
      if (/\b(product|compare|learn|details|features|solutions|templates|configure|customize|choose|select|macbook)\b/.test(haystack)) return "product";
      if (/\b(shop|buy|store|bag|cart|checkout)\b/.test(haystack)) return "commerce";
      if (/\b(support|help|contact|sales|demo)\b/.test(haystack)) return "support";
      if (/\b(menu|nav|navigation|open|close)\b/.test(haystack)) return "navigation";
      if (/\b(privacy|terms|legal|cookie|careers)\b/.test(haystack)) return "legal";
      return "unknown";
    }

    function isVisible(element: Element) {
      const htmlElement = element as HTMLElement;
      const rect = htmlElement.getBoundingClientRect();
      const style = window.getComputedStyle(htmlElement);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    }

    function cssEscape(value: string) {
      return value.replace(/["\\]/g, "\\$&");
    }
  }, targetOrigin);

  const actionCandidates = raw.actionCandidates.map(sanitizeCandidate);
  const links = actionCandidates.filter((candidate) => candidate.kind === "link");
  const buttons = actionCandidates.filter((candidate) => candidate.kind === "button");
  const forms = actionCandidates.filter((candidate) => candidate.kind === "input");
  const headings = raw.headings.map((text) => sanitizeText(text, 120)).filter(Boolean);
  const visibleSnippets = raw.visibleSnippets.map((text) => sanitizeText(text, 180)).filter(Boolean);
  const url = redactUrl(raw.url);
  const title = sanitizeText(raw.title, 120) || hostLabel(raw.url);
  const riskSignals = riskSignalsFor({ bodyText: raw.bodyText, actionCandidates, visibleSnippets });
  const pageCategory = pageCategoryFor({ title, headings, visibleSnippets, actionCandidates, riskSignals });
  const evidenceCandidates = evidenceCandidatesFor({ url, title, headings, visibleSnippets, actionCandidates });

  return {
    version: 1,
    stepId,
    url,
    title,
    headings,
    visibleSnippets,
    links,
    buttons,
    forms,
    actionCandidates,
    pageCategory,
    riskSignals,
    evidenceCandidates,
    capturedAt: new Date().toISOString()
  };
}

export function summarizeObservation(observation: PageObservation) {
  const examples = observation.actionCandidates
    .slice(0, 4)
    .map((candidate) => `${candidate.label}${candidate.category ? ` (${candidate.category})` : ""}`)
    .join(", ");
  const risks = observation.riskSignals.length > 0
    ? ` Risk signals: ${observation.riskSignals.map((signal) => signal.type).slice(0, 3).join(", ")}.`
    : "";
  return `Observed ${observation.links.length} links, ${observation.buttons.length} buttons, ${observation.forms.length} form fields, and ${observation.actionCandidates.length} visible candidate action(s) on ${hostLabel(observation.url)}.${examples ? ` Examples: ${examples}.` : ""}${risks}`;
}

function sanitizeCandidate(candidate: ObservedActionCandidate): ObservedActionCandidate {
  return {
    ...candidate,
    label: sanitizeText(candidate.label, 100),
    href: candidate.href ? redactUrl(candidate.href) : undefined,
    sectionLabel: candidate.sectionLabel ? sanitizeText(candidate.sectionLabel, 80) : undefined,
    nearbyText: candidate.nearbyText ? sanitizeText(candidate.nearbyText, 140) : undefined
  };
}

function riskSignalsFor(input: { bodyText: string; actionCandidates: ObservedActionCandidate[]; visibleSnippets: string[] }): PageRiskSignal[] {
  const signals: PageRiskSignal[] = [];
  const bodyText = normalize(input.bodyText);
  const unsafe = input.actionCandidates.filter((candidate) => candidate.category === "unsafe").slice(0, 4);
  const authActions = input.actionCandidates.filter((candidate) => candidate.category === "auth").slice(0, 3);

  if (/\b(access denied|unauthorized|authentication required|login required|sign in required|members only|private page|captcha|recaptcha|hcaptcha|turnstile|verification code|two-factor|2fa|otp)\b/.test(bodyText)) {
    signals.push({ type: "auth_wall", severity: "high", message: "Authentication, CAPTCHA, verification, or private-access language is visible." });
  }
  if (authActions.length > 0 && /\b(password|sign in|login|account)\b/.test(bodyText)) {
    signals.push({ type: "auth_wall", severity: "high", message: "Visible auth controls suggest the public goal is gated." });
  }
  if (unsafe.length > 0) {
    signals.push({ type: "unsafe_action", severity: "medium", message: `Visible commitment action(s): ${unsafe.map((item) => item.label).join(", ")}.` });
  }
  if (/\b(cookie|cookies|consent|privacy choices)\b/.test(bodyText)) {
    signals.push({ type: "cookie_modal", severity: "low", message: "Cookie or consent language is visible." });
  }
  if (input.actionCandidates.length === 0) {
    signals.push({ type: "no_action", severity: "medium", message: "No visible links, buttons, or form fields were available." });
  }

  return signals;
}

function pageCategoryFor(input: {
  title: string;
  headings: string[];
  visibleSnippets: string[];
  actionCandidates: ObservedActionCandidate[];
  riskSignals: PageRiskSignal[];
}): PageObservation["pageCategory"] {
  if (input.riskSignals.some((signal) => signal.type === "auth_wall" && signal.severity === "high")) {
    return "auth_wall";
  }
  if (input.actionCandidates.length === 0 && input.visibleSnippets.length === 0) {
    return "empty";
  }

  const haystack = normalize(`${input.title} ${input.headings.join(" ")} ${input.visibleSnippets.join(" ")} ${input.actionCandidates.map((item) => `${item.label} ${item.category ?? ""}`).join(" ")}`);
  if (/\b(docs|documentation|api|sdk|install|quickstart|guide|developer)\b/.test(haystack)) return "docs";
  if (/\b(pricing|price|plans|billing|cost)\b/.test(haystack)) return "pricing";
  if (/\b(compare|product|features|configure|customize|choose|select|macbook|models)\b/.test(haystack)) return "product";
  if (/\b(search|query|find)\b/.test(haystack)) return "search";
  if (/\b(cart|checkout|bag|pay|shop|store)\b/.test(haystack)) return "commerce";
  if (/\b(contact|support|help|sales|demo)\b/.test(haystack)) return "support";
  if (/\b(privacy|terms|legal|cookie)\b/.test(haystack)) return "legal";
  return "unknown";
}

function evidenceCandidatesFor(input: {
  url: string;
  title: string;
  headings: string[];
  visibleSnippets: string[];
  actionCandidates: ObservedActionCandidate[];
}): EvidenceCandidate[] {
  const candidates: EvidenceCandidate[] = [
    { source: "url", text: input.url },
    { source: "title", text: input.title },
    ...input.headings.slice(0, 8).map((text) => ({ source: "heading" as const, text })),
    ...input.visibleSnippets.slice(0, 8).map((text) => ({ source: "snippet" as const, text })),
    ...input.actionCandidates.slice(0, 14).map((candidate) => ({
      source: "action" as const,
      text: sanitizeText(`${candidate.label} ${candidate.sectionLabel ?? ""} ${candidate.nearbyText ?? ""}`, 180)
    }))
  ];

  return candidates
    .filter((candidate) => Boolean(candidate.text))
    .filter((candidate, index, all) => all.findIndex((item) => normalize(item.text) === normalize(candidate.text)) === index)
    .slice(0, 36);
}

function redactUrl(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl);
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "unknown-url";
  }
}

function hostLabel(rawUrl: string) {
  try {
    return new URL(rawUrl).hostname;
  } catch {
    return "unknown-host";
  }
}

function sanitizeText(value: string, maxLength: number) {
  return value
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted-email]")
    .replace(/\b(?:password|token|secret|api[_-]?key)\s*[:=]\s*\S+/gi, "$1=[redacted]")
    .replace(/https?:\/\/[^\s)]+/gi, (url) => redactUrl(url))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}
