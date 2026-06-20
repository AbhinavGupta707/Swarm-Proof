import { createAiProvider, externalActionPlannerSystemPrompt, type AiProvider } from "@swarmproof/ai";
import { personaProfileForMode, type GoalTopicFocus, type ObservedActionCandidate, type ObservedActionCategory, type ObservedActionKind, type PersonaMode } from "@swarmproof/types";
import { shouldSkipExternalAction } from "./safety";

export type ExternalCandidateKind = ObservedActionKind;
export type ExternalCandidateCategory = ObservedActionCategory;
export type ExternalCandidate = ObservedActionCandidate;

type PlannerMetadata = {
  observation: string;
  personaReasoning: string;
  expectedEvidence: string;
  stopReason?: string;
  confidence: number;
};

export type PlannedExternalAction =
  | ({ type: "click"; candidate: ExternalCandidate; reason: string; score: number } & PlannerMetadata)
  | ({ type: "fill"; candidate: ExternalCandidate; value: string; reason: string; score: number } & PlannerMetadata)
  | ({ type: "done"; reason: string; evidence: string; score: number } & PlannerMetadata)
  | ({ type: "fail"; reason: string; evidence: string; score: number } & PlannerMetadata)
  | ({ type: "none"; reason: string; score: 0 } & PlannerMetadata);

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
  observation?: string;
  personaReasoning?: string;
  expectedEvidence?: string;
  stopReason?: string;
  confidence?: number;
};

export function planExternalAction(input: PlanExternalActionInput): PlannedExternalAction {
  const visited = new Set((input.visitedHrefs ?? []).map(normalizeUrlKey));
  const usedOrdinals = new Set(input.usedOrdinals ?? []);
  const goalTokens = meaningfulTokens(input.goal);
  const topicFocus = topicFocusForGoal(input.goal);
  const context = {
    goalTokens,
    topicFocus,
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
      score: 0,
      ...fallbackMetadata(input.personaMode, "Visible controls did not produce a safe, goal-relevant action.", "No safe evidence can be collected from the available candidates.", "No safe same-origin, goal-relevant action was available.", 0.3)
    };
  }

  return planForScoredCandidate(best, input.goal, input.personaMode);
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
  const aiMetadata = metadataFromDecision(decision, input.personaMode);
  if (decision.action === "observe") {
    if (isExecutableExternalPlan(fallback)) {
      return fallback;
    }

    return {
      type: "none",
      reason: reason || "AI planner chose to observe rather than execute a public-site action.",
      score: 0,
      ...aiMetadata,
      stopReason: aiMetadata.stopReason || reason || "Planner observed but did not select a safe executable action."
    };
  }

  if (decision.action === "done" && reason) {
    if (isExecutableExternalPlan(fallback)) {
      return fallback;
    }

    return {
      type: "none",
      reason: `AI planner suggested done, but success is verifier-only: ${reason}`,
      score: 0,
      ...aiMetadata,
      stopReason: aiMetadata.stopReason || "Planner cannot mark success; verifier must prove required evidence."
    };
  }

  if (decision.action === "fail" && reason) {
    return {
      type: "fail",
      reason,
      evidence: normalizeReason(decision.evidence) || reason,
      score: 0,
      ...aiMetadata,
      stopReason: aiMetadata.stopReason || reason
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
    topicFocus: topicFocusForGoal(input.goal),
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
    reason: reason || `AI chose validated candidate: ${scored.candidate.label}.`,
    metadata: aiMetadata
  }, input.goal, input.personaMode);
}

function scoreCandidates(
  candidates: ExternalCandidate[],
  context: {
    goalTokens: string[];
    topicFocus?: GoalTopicFocus;
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

function planForScoredCandidate(scored: ScoredCandidate, goal: string, personaMode: PersonaMode): PlannedExternalAction {
  const metadata = scored.metadata ?? candidateMetadata(scored, personaMode);
  if (scored.candidate.kind === "input") {
    return {
      type: "fill",
      candidate: scored.candidate,
      value: fillValueFor(scored.candidate, goal),
      reason: scored.reason,
      score: scored.score,
      ...metadata
    };
  }

  return {
    type: "click",
    candidate: scored.candidate,
    reason: scored.reason,
    score: scored.score,
    ...metadata
  };
}

type ScoredCandidate = {
  candidate: ExternalCandidate;
  reason: string;
  score: number;
  metadata?: PlannerMetadata;
};

function scoreCandidate(
  candidate: ExternalCandidate,
  context: {
    goalTokens: string[];
    topicFocus?: GoalTopicFocus;
    personaMode: PersonaMode;
    allowFormActions: boolean;
    visited: Set<string>;
    usedOrdinals: Set<number>;
  }
): ScoredCandidate | undefined {
  const label = normalizeLabel(candidate.label);
  const lowerLabel = label.toLowerCase();
  const category = candidate.category ?? categoryForCandidate(candidate);
  if (!label || candidate.disabled || context.usedOrdinals.has(candidate.ordinal) || category === "unsafe" || shouldSkipExternalAction(label) || isCredentialBoundaryLabel(lowerLabel)) {
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
  const sectionText = normalizeLabel(`${candidate.sectionLabel ?? ""} ${candidate.nearbyText ?? ""}`).toLowerCase();
  const matchedContextTokens = context.goalTokens.filter((token) => sectionText.includes(token) && !lowerLabel.includes(token));
  const topicScore = topicScoreForCandidate(context.topicFocus, `${label} ${candidate.href ?? ""} ${sectionText}`, category);
  score += matchedGoalTokens.length * 7;
  score += matchedContextTokens.length * 3;
  score += topicScore.delta;

  if (/\b(get started|start|try|demo|learn|learn more|docs|documentation|pricing|create|invite|join|shop|buy|compare|customize|choose|select|configure)\b/i.test(label)) {
    score += 8;
  }

  if (candidate.kind === "input" && isSearchInput(candidate)) {
    score += 8;
  }

  if (category === "docs" || category === "pricing" || category === "product" || category === "search") {
    score += 5;
  }

  if (context.personaMode === "impatient" && label.length <= 24) {
    score += 3;
  }

  if (context.personaMode === "mobile" && (category === "navigation" || /\b(menu|open|start|get started)\b/i.test(label))) {
    score += 4;
  }

  if (context.personaMode === "chaos" && (category === "product" || /\b(compare|learn|details|reviews|change|customize|configure|back)\b/i.test(label))) {
    score += 4;
  }

  if (category === "legal" || /\b(blog|careers|terms|privacy|legal|cookie)\b/i.test(label)) {
    score -= 5;
  }

  return {
    candidate: { ...candidate, category },
    score,
    reason: matchedGoalTokens.length > 0
      ? `Best safe ${category} candidate matched goal token(s): ${matchedGoalTokens.slice(0, 3).join(", ")}.`
      : matchedContextTokens.length > 0
        ? `Best safe ${category} candidate appeared near goal context: ${matchedContextTokens.slice(0, 3).join(", ")}.`
        : topicScore.reason
          ? topicScore.reason
        : `Best safe ${category} exploratory candidate: ${label}.`
  };
}

function candidateMetadata(scored: ScoredCandidate, personaMode: PersonaMode): PlannerMetadata {
  const persona = personaProfileForMode(personaMode);
  const candidate = scored.candidate;
  const label = normalizeLabel(candidate.label);
  const category = candidate.category ?? categoryForCandidate(candidate);
  return {
    observation: `Visible ${candidate.kind} "${label}"${candidate.sectionLabel ? ` in ${candidate.sectionLabel}` : ""}${category !== "unknown" ? ` (${category})` : ""}.`,
    personaReasoning: `${persona.name} would try this because ${scored.reason.replace(/\.$/, "")}. ${persona.decisionBiases[0] ?? persona.behavioralLens}`,
    expectedEvidence: category === "search"
      ? `Search results or filtered content related to the goal.`
      : candidate.href
        ? `A safe same-origin page that may reveal ${category} evidence for the goal.`
        : `A visible page state change showing whether "${label}" advances the goal.`,
    confidence: Math.max(0.35, Math.min(0.95, scored.score / 40)),
    stopReason: undefined
  };
}

function fallbackMetadata(personaMode: PersonaMode, observation: string, expectedEvidence: string, stopReason: string, confidence: number): PlannerMetadata {
  const persona = personaProfileForMode(personaMode);
  return {
    observation,
    personaReasoning: `${persona.name} stops because ${persona.stopCriteria[1] ?? persona.stopCriteria[0] ?? "the page does not offer safe evidence"}.`,
    expectedEvidence,
    stopReason,
    confidence
  };
}

function metadataFromDecision(decision: AiPlannerDecision, personaMode: PersonaMode): PlannerMetadata {
  const fallback = fallbackMetadata(
    personaMode,
    "AI planner observed the current public page state.",
    "The next action should reveal goal evidence without crossing safety boundaries.",
    normalizeReason(decision.stopReason),
    normalizeConfidence(decision.confidence)
  );
  return {
    observation: normalizeReason(decision.observation) || fallback.observation,
    personaReasoning: normalizeReason(decision.personaReasoning) || fallback.personaReasoning,
    expectedEvidence: normalizeReason(decision.expectedEvidence) || fallback.expectedEvidence,
    stopReason: normalizeReason(decision.stopReason) || undefined,
    confidence: normalizeConfidence(decision.confidence)
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
  const persona = personaProfileForMode(input.personaMode);
  const candidates = input.candidates.slice(0, 50).map((candidate) => ({
    ordinal: candidate.ordinal,
    kind: candidate.kind,
    label: candidate.label,
    href: candidate.href,
    sameOrigin: candidate.sameOrigin ?? true,
    inputType: candidate.inputType,
    disabled: candidate.disabled,
    sectionLabel: candidate.sectionLabel,
    nearbyText: candidate.nearbyText,
    category: candidate.category ?? categoryForCandidate(candidate),
    blocked: shouldSkipExternalAction(candidate.label) || isCredentialBoundaryLabel(candidate.label.toLowerCase())
  }));

  return JSON.stringify({
    schema: {
      action: "choose_candidate | observe | done | fail",
      ordinal: "required only when action is choose_candidate; must be one of the provided ordinals",
      reason: "short evidence-based reason",
      evidence: "short page/history evidence for done or fail",
      observation: "what the current page and candidates suggest",
      personaReasoning: "why this persona would choose, avoid, or stop",
      expectedEvidence: "what the action should prove or disprove",
      stopReason: "required when action is observe, done, or fail",
      confidence: "number from 0 to 1"
    },
    safetyPolicy: [
      "Choose only a provided candidate ordinal.",
      "Safe exploration includes Buy, Shop, Compare, Customize, Choose, Select, Learn more, and same-origin product/configuration links.",
      "Do not choose Signup, Login, Start Deploying, Add to Cart, Add to Bag, Checkout, Place Order, Pay, Contact Sales, Book Demo, Start Trial, Create Account, credential, payment, or private-data actions.",
      "If only unsafe commitment actions remain, return observe with a truthful safety reason."
    ],
    topicFocus: topicFocusForGoal(input.goal),
    goal: input.goal,
    persona,
    page: input.page,
    history: (input.history ?? []).slice(-8),
    candidates
  });
}

function topicFocusForGoal(goal: string): GoalTopicFocus | undefined {
  const normalized = normalizeLabel(goal).toLowerCase();
  if (/\bmacbook\s+air\b/.test(normalized)) {
    return {
      label: "MacBook Air",
      requiredTerms: ["macbook air"],
      relatedTerms: ["mac", "macbook"],
      excludedTerms: ["iphone", "ipad", "airpods", "apple watch", "watch", "vision pro", "iphone accessories"]
    };
  }
  if (/\bmacbook\s+pro\b/.test(normalized)) {
    return {
      label: "MacBook Pro",
      requiredTerms: ["macbook pro"],
      relatedTerms: ["mac", "macbook"],
      excludedTerms: ["iphone", "ipad", "airpods", "apple watch", "watch", "vision pro", "iphone accessories"]
    };
  }
  if (/\bnext(?:\.|\s|-)?js\b|\bnextjs\b/.test(normalized)) {
    return {
      label: "Next.js",
      requiredTerms: ["next.js", "nextjs"],
      relatedTerms: ["next", "javascript", "react"],
      excludedTerms: ["tanstack", "react native", "flutter", "swift", "android"]
    };
  }
  return undefined;
}

function topicScoreForCandidate(topicFocus: GoalTopicFocus | undefined, candidateText: string, category: ExternalCandidateCategory) {
  if (!topicFocus) {
    return { delta: 0, reason: "" };
  }

  const normalized = candidateText.toLowerCase().replace(/\s+/g, " ").trim();
  if (topicFocus.excludedTerms.some((term) => normalized.includes(term))) {
    return {
      delta: -40,
      reason: `Candidate looked off-topic for ${topicFocus.label}.`
    };
  }
  if (topicFocus.requiredTerms.some((term) => normalized.includes(term))) {
    return {
      delta: 16,
      reason: `Best safe ${category} candidate explicitly matched ${topicFocus.label}.`
    };
  }
  if (topicFocus.relatedTerms.some((term) => normalized.includes(term))) {
    return {
      delta: 6,
      reason: `Best safe ${category} candidate stayed in the ${topicFocus.label} topic area.`
    };
  }
  if (category === "commerce" || category === "product") {
    return {
      delta: -18,
      reason: `Candidate did not show enough ${topicFocus.label} context.`
    };
  }
  return { delta: 0, reason: "" };
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

function normalizeConfidence(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : 0.5;
}

function categoryForCandidate(candidate: Pick<ExternalCandidate, "label" | "href" | "inputType" | "category" | "sectionLabel" | "nearbyText">): ExternalCandidateCategory {
  if (candidate.category) return candidate.category;
  const haystack = `${candidate.label} ${candidate.href ?? ""} ${candidate.inputType ?? ""} ${candidate.sectionLabel ?? ""} ${candidate.nearbyText ?? ""}`.toLowerCase();
  if (isCredentialBoundaryLabel(candidate.label.toLowerCase()) || shouldSkipExternalAction(candidate.label)) return "unsafe";
  if (/\b(search|query|find)\b/.test(haystack)) return "search";
  if (/\b(docs|documentation|api|sdk|install|guide|quickstart|developer)\b/.test(haystack)) return "docs";
  if (/\b(pricing|plans|cost|billing)\b/.test(haystack)) return "pricing";
  if (/\b(product|compare|learn|details|features|solutions|templates|macbook|configure|customize|choose|select)\b/.test(haystack)) return "product";
  if (/\b(shop|buy|store|bag|cart|checkout)\b/.test(haystack)) return "commerce";
  if (/\b(support|help|contact|sales|demo)\b/.test(haystack)) return "support";
  if (/\b(login|log in|sign in|signup|sign up|account|trial)\b/.test(haystack)) return "auth";
  if (/\b(menu|nav|navigation|open|close)\b/.test(haystack)) return "navigation";
  if (/\b(privacy|terms|legal|cookie|careers)\b/.test(haystack)) return "legal";
  return "unknown";
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
  "website",
  "information",
  "supabase",
  "vercel",
  "apple",
  "stripe"
]);
