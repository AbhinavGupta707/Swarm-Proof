import { createAiProvider, externalActionPlannerSystemPrompt, type AiProvider } from "@swarmproof/ai";
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
  | { type: "done"; reason: string; evidence: string; score: number }
  | { type: "fail"; reason: string; evidence: string; score: number }
  | { type: "none"; reason: string; score: 0 };

type PlanExternalActionInput = {
  goal: string;
  personaMode: PersonaMode;
  candidates: ExternalCandidate[];
  allowFormActions?: boolean;
  visitedHrefs?: string[];
  usedOrdinals?: number[];
};

type AiPlannerDecision = {
  action?: "choose_candidate" | "observe" | "done" | "fail";
  ordinal?: number;
  reason?: string;
  evidence?: string;
};

export function planExternalAction(input: PlanExternalActionInput): PlannedExternalAction {
  const visited = new Set((input.visitedHrefs ?? []).map(normalizeUrlKey));
  const usedOrdinals = new Set(input.usedOrdinals ?? []);
  const goalTokens = meaningfulTokens(input.goal);
  const context = {
    goalTokens,
    personaMode: input.personaMode,
    allowFormActions: Boolean(input.allowFormActions),
    visited,
    usedOrdinals
  };
  const scored = scoreCandidates(input.candidates, context);

  const best = scored[0];
  if (!best || best.score < 8) {
    return {
      type: "none",
      reason: "No safe same-origin, goal-relevant action was available.",
      score: 0
    };
  }

  return planForScoredCandidate(best, input.goal);
}

export async function planExternalActionWithAi(input: PlanExternalActionInput & {
  page: { url: string; title: string };
  history?: string[];
  aiProvider?: AiProvider;
  timeoutMs?: number;
}): Promise<PlannedExternalAction> {
  const fallback = planExternalAction(input);
  const aiProvider = input.aiProvider;
  if (!aiProvider && !process.env.FIREWORKS_API_KEY) {
    return fallback;
  }

  const decision = await withTimeout(
    (aiProvider ?? createAiProvider()).generateJson<AiPlannerDecision>({
      system: externalActionPlannerSystemPrompt,
      prompt: buildAiPlannerPrompt(input),
      fallback: { action: "observe", reason: "AI planner fallback." }
    }),
    input.timeoutMs ?? 4500,
    { action: "observe", reason: "AI planner timed out." }
  );
  return validateAiDecision(decision, input, fallback);
}

export function isExecutableExternalPlan(
  plan: PlannedExternalAction
): plan is Extract<PlannedExternalAction, { type: "click" | "fill" }> {
  return plan.type === "click" || plan.type === "fill";
}

function validateAiDecision(
  decision: AiPlannerDecision,
  input: PlanExternalActionInput,
  fallback: PlannedExternalAction
): PlannedExternalAction {
  if (!decision || typeof decision !== "object") {
    return fallback;
  }

  const reason = normalizeReason(decision.reason);
  if (decision.action === "observe") {
    if (isExecutableExternalPlan(fallback)) {
      return fallback;
    }

    return {
      type: "none",
      reason: reason || "AI planner chose to observe rather than execute a public-site action.",
      score: 0
    };
  }

  if (decision.action === "done" && reason) {
    return {
      type: "done",
      reason,
      evidence: normalizeReason(decision.evidence) || reason,
      score: 100
    };
  }

  if (decision.action === "fail" && reason) {
    return {
      type: "fail",
      reason,
      evidence: normalizeReason(decision.evidence) || reason,
      score: 0
    };
  }

  if (decision.action !== "choose_candidate" || !Number.isInteger(decision.ordinal)) {
    return fallback;
  }

  const candidate = input.candidates.find((item) => item.ordinal === decision.ordinal);
  if (!candidate) {
    return fallback;
  }

  const visited = new Set((input.visitedHrefs ?? []).map(normalizeUrlKey));
  const usedOrdinals = new Set(input.usedOrdinals ?? []);
  const scored = scoreCandidate(candidate, {
    goalTokens: meaningfulTokens(input.goal),
    personaMode: input.personaMode,
    allowFormActions: Boolean(input.allowFormActions),
    visited,
    usedOrdinals
  });
  if (!scored) {
    return fallback;
  }

  return planForScoredCandidate({
    ...scored,
    reason: reason || `AI chose validated candidate: ${scored.candidate.label}.`
  }, input.goal);
}

function scoreCandidates(
  candidates: ExternalCandidate[],
  context: {
    goalTokens: string[];
    personaMode: PersonaMode;
    allowFormActions: boolean;
    visited: Set<string>;
    usedOrdinals: Set<number>;
  }
) {
  return candidates
    .map((candidate) => scoreCandidate(candidate, context))
    .filter((candidate): candidate is ScoredCandidate => candidate !== undefined)
    .sort((left, right) => right.score - left.score);
}

function planForScoredCandidate(scored: ScoredCandidate, goal: string): PlannedExternalAction {
  if (scored.candidate.kind === "input") {
    return {
      type: "fill",
      candidate: scored.candidate,
      value: fillValueFor(scored.candidate, goal),
      reason: scored.reason,
      score: scored.score
    };
  }

  return {
    type: "click",
    candidate: scored.candidate,
    reason: scored.reason,
    score: scored.score
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
    usedOrdinals: Set<number>;
  }
): ScoredCandidate | undefined {
  const label = normalizeLabel(candidate.label);
  const lowerLabel = label.toLowerCase();
  if (!label || candidate.disabled || context.usedOrdinals.has(candidate.ordinal) || shouldSkipExternalAction(label) || isCredentialBoundaryLabel(lowerLabel)) {
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

  if (/\b(get started|start|try|demo|learn|learn more|docs|documentation|pricing|create|invite|join|shop|buy|compare|customize|choose|select|configure)\b/i.test(label)) {
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

  if (context.personaMode === "chaos" && /\b(compare|learn|details|reviews|change|customize|configure|back)\b/i.test(label)) {
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
  return /\b(log in|login|sign in|signin|sign up|signup|create account|start trial|free trial|try for free|start deploying|deploy now|contact sales|talk to sales|book demo|book a demo|request demo|schedule demo|schedule a demo|password|sso|continue with google|continue with github)\b/i.test(label);
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

function buildAiPlannerPrompt(input: PlanExternalActionInput & { page: { url: string; title: string }; history?: string[] }) {
  const candidates = input.candidates.slice(0, 50).map((candidate) => ({
    ordinal: candidate.ordinal,
    kind: candidate.kind,
    label: candidate.label,
    href: candidate.href,
    sameOrigin: candidate.sameOrigin ?? true,
    inputType: candidate.inputType,
    disabled: candidate.disabled,
    blocked: shouldSkipExternalAction(candidate.label) || isCredentialBoundaryLabel(candidate.label.toLowerCase())
  }));

  return JSON.stringify({
    schema: {
      action: "choose_candidate | observe | done | fail",
      ordinal: "required only when action is choose_candidate; must be one of the provided ordinals",
      reason: "short evidence-based reason",
      evidence: "short page/history evidence for done or fail"
    },
    safetyPolicy: [
      "Choose only a provided candidate ordinal.",
      "Safe exploration includes Buy, Shop, Compare, Customize, Choose, Select, Learn more, and same-origin product/configuration links.",
      "Do not choose Signup, Login, Start Deploying, Add to Cart, Add to Bag, Checkout, Place Order, Pay, Contact Sales, Book Demo, Start Trial, Create Account, credential, payment, or private-data actions.",
      "If only unsafe commitment actions remain, return observe with a truthful safety reason."
    ],
    goal: input.goal,
    personaMode: input.personaMode,
    page: input.page,
    history: (input.history ?? []).slice(-8),
    candidates
  });
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutValue: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(timeoutValue), timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function normalizeReason(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, 220) : "";
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
