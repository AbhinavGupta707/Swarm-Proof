import { personaProfileForMode, type GoalSpec, type EvidenceRequirement, type PersonaMode } from "@swarmproof/types";

export type CompileGoalSpecInput = {
  goal: string;
  targetUrl: string;
  personaMode: PersonaMode;
  allowFormActions?: boolean;
};

export function compileGoalSpec(input: CompileGoalSpecInput): GoalSpec {
  const goal = sanitizeText(input.goal, 500) || "Explore the product and identify the main user friction.";
  const persona = personaProfileForMode(input.personaMode);
  const normalizedGoal = normalize(goal);
  const mustFind = dedupeRequirements([
    ...specificProductRequirements(normalizedGoal),
    ...frameworkRequirements(normalizedGoal),
    ...intentRequirements(normalizedGoal),
    ...fallbackRequirements(normalizedGoal)
  ]);
  const niceToFind = niceToFindRequirements(normalizedGoal, mustFind);

  return {
    version: 1,
    goal,
    personaMode: input.personaMode,
    personaInterpretation: sanitizeText(`${persona.name}: ${persona.goalInterpretation}`, 260),
    mustFind,
    niceToFind,
    forbiddenActions: forbiddenActionsFor(normalizedGoal),
    successRubric: [
      "Every mustFind requirement must be supported by sanitized page observation or recorded step evidence.",
      "Persona interpretation can change which safe action is tried next, but it cannot weaken or replace the shared mustFind requirements.",
      "Success is blocked if the run crosses or depends on a forbidden action, private credential, payment, checkout, destructive action, or cross-origin commitment.",
      "Nice-to-find evidence can improve confidence but cannot compensate for a missing mustFind requirement."
    ],
    stopConditions: [
      "Verifier says all mustFind evidence is met.",
      "Only forbidden, unsafe, auth, payment, checkout, sales, destructive, or private-data actions remain.",
      "The page shows an auth, CAPTCHA, verification, or access-denied wall.",
      "The persona reaches the safe step budget without enough required evidence."
    ],
    allowedScope: {
      origin: originFor(input.targetUrl),
      sameOriginOnly: true,
      allowFormActions: Boolean(input.allowFormActions),
      notes: [
        "External public runs stay on same-origin public pages.",
        input.allowFormActions
          ? "Form actions are allowed only for the owned demo target or explicitly owner-confirmed flows."
          : "External form submissions are limited to safe search fields."
      ]
    },
    compiledBy: "deterministic"
  };
}

function specificProductRequirements(normalizedGoal: string): EvidenceRequirement[] {
  const requirements: EvidenceRequirement[] = [];
  if (/\bmacbook\s+air\b/.test(normalizedGoal)) {
    requirements.push({
      id: "product_macbook_air",
      label: "MacBook Air product identity",
      anyOf: [["macbook air"]],
      source: "goal"
    });
  }
  if (/\bmacbook\s+pro\b/.test(normalizedGoal)) {
    requirements.push({
      id: "product_macbook_pro",
      label: "MacBook Pro product identity",
      anyOf: [["macbook pro"]],
      source: "goal"
    });
  }
  return requirements;
}

function frameworkRequirements(normalizedGoal: string): EvidenceRequirement[] {
  const requirements: EvidenceRequirement[] = [];
  if (/\bnext(?:\.|\s|-)?js\b|\bnextjs\b/.test(normalizedGoal)) {
    requirements.push({
      id: "framework_nextjs",
      label: "Next.js framework identity",
      anyOf: [["next.js"], ["nextjs"], ["next", "js"]],
      source: "goal"
    });
  }
  if (/\bsupabase\b/.test(normalizedGoal)) {
    requirements.push({
      id: "platform_supabase",
      label: "Supabase product context",
      anyOf: [["supabase"]],
      source: "goal"
    });
  }
  return requirements;
}

function intentRequirements(normalizedGoal: string): EvidenceRequirement[] {
  const requirements: EvidenceRequirement[] = [];
  if (/\b(pricing|price|prices|cost|costs|plans?)\b/.test(normalizedGoal)) {
    requirements.push({
      id: "intent_pricing",
      label: "Pricing or plan evidence",
      anyOf: [["pricing"], ["price"], ["from $"], ["plans"], ["cost"]],
      source: "goal"
    });
  }
  if (/\b(configur|customi[sz]e|choices?|options?|choose|select|model)\b/.test(normalizedGoal)) {
    requirements.push({
      id: "intent_configuration",
      label: "Configuration or option evidence",
      anyOf: [["configure"], ["configuration"], ["customize"], ["choices"], ["options"], ["choose"], ["select"], ["memory"], ["storage"], ["chip"]],
      source: "goal"
    });
  }
  if (/\b(compare|comparison|versus|vs\.?|models?)\b/.test(normalizedGoal)) {
    requirements.push({
      id: "intent_compare",
      label: "Comparison evidence",
      anyOf: [["compare"], ["comparison"], ["models"], ["versus"]],
      source: "goal"
    });
  }
  if (/\b(quickstart|quick\s+start|install|installation|setup|set\s+up|getting\s+started)\b/.test(normalizedGoal)) {
    requirements.push({
      id: "intent_quickstart_install",
      label: "Quickstart or installation evidence",
      anyOf: [["quickstart"], ["quick start"], ["install"], ["installation"], ["setup"], ["getting started"]],
      source: "goal"
    });
  }
  if (/\b(docs|documentation|guide|developer)\b/.test(normalizedGoal)) {
    requirements.push({
      id: "intent_docs",
      label: "Documentation or guide evidence",
      anyOf: [["docs"], ["documentation"], ["guide"], ["developer"]],
      source: "goal"
    });
  }
  return requirements;
}

function fallbackRequirements(normalizedGoal: string): EvidenceRequirement[] {
  if (specificProductRequirements(normalizedGoal).length || frameworkRequirements(normalizedGoal).length || intentRequirements(normalizedGoal).length) {
    return [];
  }

  return meaningfulGoalTokens(normalizedGoal)
    .slice(0, 3)
    .map((token) => ({
      id: `goal_${token}`,
      label: `Goal term: ${token}`,
      anyOf: [[token]],
      source: "goal" as const
    }));
}

function niceToFindRequirements(normalizedGoal: string, mustFind: EvidenceRequirement[]) {
  const existingIds = new Set(mustFind.map((item) => item.id));
  const inferred: EvidenceRequirement[] = [
    {
      id: "nice_safe_summary",
      label: "Non-committing summary or review state",
      anyOf: [["summary"], ["review"], ["overview"]],
      source: "inferred"
    },
    {
      id: "nice_public_navigation",
      label: "Clear public navigation path",
      anyOf: [["docs"], ["pricing"], ["compare"], ["learn more"], ["guide"]],
      source: "inferred"
    }
  ];

  if (/\bmobile\b/.test(normalizedGoal)) {
    inferred.push({
      id: "nice_mobile_navigation",
      label: "Mobile-visible navigation",
      anyOf: [["menu"], ["navigation"], ["mobile"]],
      source: "inferred"
    });
  }

  return inferred.filter((item) => !existingIds.has(item.id));
}

function forbiddenActionsFor(normalizedGoal: string) {
  const base = [
    "add to bag",
    "add to cart",
    "checkout",
    "place order",
    "pay",
    "payment",
    "subscribe",
    "start trial",
    "free trial",
    "sign up",
    "signup",
    "create account",
    "log in",
    "login",
    "sign in",
    "contact sales",
    "talk to sales",
    "book demo",
    "request demo",
    "schedule demo",
    "delete",
    "remove",
    "destroy",
    "password",
    "credential",
    "private data"
  ];
  const explicitStops = normalizedGoal.match(/stop before ([^.]+)/)?.[1]
    ?.split(/,|\bor\b|\band\b/)
    .map((item) => item.trim())
    .filter(Boolean) ?? [];
  return [...new Set([...base, ...explicitStops])].slice(0, 40);
}

function dedupeRequirements(requirements: EvidenceRequirement[]) {
  const byId = new Map<string, EvidenceRequirement>();
  for (const requirement of requirements) {
    if (!byId.has(requirement.id)) {
      byId.set(requirement.id, requirement);
    }
  }
  return [...byId.values()];
}

function meaningfulGoalTokens(normalizedGoal: string) {
  return normalizedGoal
    .split(/[^a-z0-9.]+/)
    .filter((token) => token.length >= 4 && !GOAL_STOP_WORDS.has(token))
    .slice(0, 8);
}

function originFor(targetUrl: string) {
  try {
    return new URL(targetUrl).origin;
  } catch {
    return "unknown-origin";
  }
}

function normalize(value: string) {
  return sanitizeText(value, 800).toLowerCase();
}

function sanitizeText(value: string, maxLength: number) {
  return value
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted-email]")
    .replace(/\b(?:password|token|secret|api[_-]?key)\s*[:=]\s*\S+/gi, "$1=[redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

const GOAL_STOP_WORDS = new Set([
  "want",
  "need",
  "find",
  "learn",
  "understand",
  "public",
  "before",
  "after",
  "where",
  "would",
  "with",
  "from",
  "this",
  "that",
  "user",
  "goal",
  "page",
  "site",
  "website",
  "product",
  "stop",
  "safe",
  "only"
]);
