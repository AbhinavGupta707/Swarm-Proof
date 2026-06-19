import type { PersonaMode } from "@swarmproof/types";
import { shouldSkipExternalAction } from "./safety";

export type ExternalCandidateKind = "link" | "button" | "input";

export type ExternalCandidate = {
  kind: ExternalCandidateKind;
  label: string;
  ordinal: number;
  href?: string;
  sameOrigin?: boolean;
  inputType?: string;
  disabled?: boolean;
};

export type PlannedExternalAction =
  | { type: "click"; candidate: ExternalCandidate; reason: string; score: number }
  | { type: "fill"; candidate: ExternalCandidate; value: string; reason: string; score: number }
  | { type: "none"; reason: string; score: 0 };

export function planExternalAction(input: {
  goal: string;
  personaMode: PersonaMode;
  candidates: ExternalCandidate[];
  allowFormActions?: boolean;
  visitedHrefs?: string[];
  usedOrdinals?: number[];
}): PlannedExternalAction {
  const visited = new Set((input.visitedHrefs ?? []).map(normalizeUrlKey));
  const usedOrdinals = new Set(input.usedOrdinals ?? []);
  const goalTokens = meaningfulTokens(input.goal);
  const scored = input.candidates
    .filter((candidate) => !usedOrdinals.has(candidate.ordinal))
    .map((candidate) => scoreCandidate(candidate, {
      goalTokens,
      personaMode: input.personaMode,
      allowFormActions: Boolean(input.allowFormActions),
      visited
    }))
    .filter((candidate): candidate is ScoredCandidate => candidate !== undefined)
    .sort((left, right) => right.score - left.score);

  const best = scored[0];
  if (!best || best.score < 8) {
    return {
      type: "none",
      reason: "No safe same-origin, goal-relevant action was available.",
      score: 0
    };
  }

  if (best.candidate.kind === "input") {
    return {
      type: "fill",
      candidate: best.candidate,
      value: fillValueFor(best.candidate, input.goal),
      reason: best.reason,
      score: best.score
    };
  }

  return {
    type: "click",
    candidate: best.candidate,
    reason: best.reason,
    score: best.score
  };
}

type ScoredCandidate = {
  candidate: ExternalCandidate;
  reason: string;
  score: number;
};

function scoreCandidate(
  candidate: ExternalCandidate,
  context: {
    goalTokens: string[];
    personaMode: PersonaMode;
    allowFormActions: boolean;
    visited: Set<string>;
  }
): ScoredCandidate | undefined {
  const label = normalizeLabel(candidate.label);
  const lowerLabel = label.toLowerCase();
  if (!label || candidate.disabled || shouldSkipExternalAction(label) || isCredentialBoundaryLabel(lowerLabel)) {
    return undefined;
  }

  if (candidate.kind === "link") {
    if (!candidate.sameOrigin || (candidate.href && context.visited.has(normalizeUrlKey(candidate.href)))) {
      return undefined;
    }
  }

  if (candidate.kind === "input" && !isFillAllowed(candidate, context.allowFormActions)) {
    return undefined;
  }

  let score = candidate.kind === "link" ? 10 : candidate.kind === "button" ? 8 : 7;
  const matchedGoalTokens = context.goalTokens.filter((token) => lowerLabel.includes(token));
  score += matchedGoalTokens.length * 7;

  if (/\b(get started|start|try|demo|learn|docs|documentation|pricing|contact|create|invite|sign up|signup|join)\b/i.test(label)) {
    score += 8;
  }

  if (candidate.kind === "input" && isSearchInput(candidate)) {
    score += 8;
  }

  if (context.personaMode === "impatient" && label.length <= 24) {
    score += 3;
  }

  if (context.personaMode === "mobile" && /\b(menu|open|start|get started)\b/i.test(label)) {
    score += 4;
  }

  if (/\b(blog|careers|terms|privacy|legal|cookie)\b/i.test(label)) {
    score -= 5;
  }

  return {
    candidate,
    score,
    reason: matchedGoalTokens.length > 0
      ? `Best safe candidate matched goal token(s): ${matchedGoalTokens.slice(0, 3).join(", ")}.`
      : `Best safe exploratory candidate: ${label}.`
  };
}

function isFillAllowed(candidate: ExternalCandidate, allowFormActions: boolean) {
  if (isUnsafeInputType(candidate.inputType)) {
    return false;
  }

  return allowFormActions || isSearchInput(candidate);
}

function isSearchInput(candidate: ExternalCandidate) {
  return /\bsearch|query|find\b/i.test(`${candidate.label} ${candidate.inputType ?? ""}`);
}

function isUnsafeInputType(inputType?: string) {
  return /\b(password|file|hidden|checkbox|radio|range|color)\b/i.test(inputType ?? "");
}

function isCredentialBoundaryLabel(label: string) {
  return /\b(log in|login|sign in|password|sso|continue with google|continue with github)\b/i.test(label);
}

function fillValueFor(candidate: ExternalCandidate, goal: string) {
  if (isSearchInput(candidate)) {
    return meaningfulTokens(goal).slice(0, 4).join(" ") || "product";
  }

  if (/\bemail\b/i.test(`${candidate.label} ${candidate.inputType ?? ""}`)) {
    return "teammate@example.com";
  }

  return "SwarmProof test";
}

function meaningfulTokens(value: string) {
  return normalizeLabel(value)
    .toLowerCase()
    .split(/\W+/)
    .filter((token) => token.length >= 4 && !STOP_WORDS.has(token))
    .slice(0, 12);
}

function normalizeLabel(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 100);
}

function normalizeUrlKey(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString();
  } catch {
    return value;
  }
}

const STOP_WORDS = new Set([
  "with",
  "from",
  "that",
  "this",
  "then",
  "into",
  "your",
  "their",
  "user",
  "flow",
  "page",
  "product",
  "website"
]);
