import { createAiProvider, evidenceVerifierSystemPrompt, type AiProvider } from "@swarmproof/ai";
import type {
  EvidenceRequirement,
  EvidenceRequirementResult,
  EvidenceVerifierResult,
  GoalSpec,
  PageObservation
} from "@swarmproof/types";

export type VerifyEvidenceInput = {
  goalSpec: GoalSpec;
  observations: PageObservation[];
  aiProvider?: AiProvider;
  timeoutMs?: number;
};

type AiVerifierDecision = {
  verdict?: EvidenceVerifierResult["verdict"];
  confidence?: number;
  explanation?: string;
  metRequirementIds?: string[];
  missingRequirementIds?: string[];
  supportingStepIds?: string[];
};

export function verifyEvidence(input: VerifyEvidenceInput): EvidenceVerifierResult {
  const observations = input.observations.slice(-8);
  const safetyFailures = deterministicSafetyFailures(input.goalSpec, observations);
  const runEvidence = evidenceCoverageFor(input.goalSpec.mustFind, observations);
  const bestCluster = bestCoherentCluster(input.goalSpec, observations);
  const metRequirements = bestCluster.complete ? bestCluster.metRequirements : runEvidence.metRequirements;
  const missingRequirements = missingRequirementsFor(input.goalSpec.mustFind, runEvidence, bestCluster);
  const supportingStepIds = bestCluster.complete
    ? bestCluster.supportingStepIds
    : supportingStepIdsFor(input.goalSpec.mustFind, observations);
  const missingLabels = missingRequirements.map((item) => item.label);
  const metLabels = metRequirements.map((item) => item.label);
  const hasNoActionRisk = observations.at(-1)?.riskSignals.some((signal) => signal.type === "no_action") ?? false;
  const verdict: EvidenceVerifierResult["verdict"] = safetyFailures.length > 0
    ? "BLOCKED"
    : missingRequirements.length === 0
      ? "SUCCEEDED"
      : hasNoActionRisk
        ? "BLOCKED"
        : metRequirements.length > 0
          ? "PARTIAL"
          : "PARTIAL";
  const confidence = confidenceFor({
    verdict,
    metCount: metRequirements.length,
    missingCount: missingRequirements.length,
    niceCount: niceToFindCount(input.goalSpec, observations),
    safetyFailures: safetyFailures.length
  });

  return {
    verdict,
    confidence,
    metRequirements,
    missingRequirements,
    explanation: explanationFor({ verdict, metLabels, missingLabels, safetyFailures }),
    supportingStepIds,
    safetyFailures,
    judge: { used: false, provider: "deterministic" }
  };
}

export async function verifyEvidenceWithAi(input: VerifyEvidenceInput): Promise<EvidenceVerifierResult> {
  const deterministic = verifyEvidence(input);
  if (!process.env.FIREWORKS_API_KEY || deterministic.safetyFailures.length > 0) {
    return deterministic;
  }

  const decision = await withTimeout(
    (input.aiProvider ?? createAiProvider()).generateJson<AiVerifierDecision>({
      system: evidenceVerifierSystemPrompt,
      prompt: buildVerifierPrompt(input, deterministic),
      fallback: {}
    }),
    input.timeoutMs ?? 4500,
    {}
  );

  return mergeAiDecision(deterministic, decision);
}

function mergeAiDecision(deterministic: EvidenceVerifierResult, decision: AiVerifierDecision): EvidenceVerifierResult {
  if (!decision || typeof decision !== "object") {
    return deterministic;
  }

  const aiVerdict = normalizeVerdict(decision.verdict);
  const canUseAiVerdict = aiVerdict && verdictRank(aiVerdict) <= verdictRank(deterministic.verdict);
  const verdict = canUseAiVerdict ? aiVerdict : deterministic.verdict;
  const confidence = normalizeConfidence(decision.confidence, deterministic.confidence);
  const explanation = sanitizeLine(decision.explanation, 360) || deterministic.explanation;
  const supportingStepIds = Array.isArray(decision.supportingStepIds)
    ? [...new Set([...deterministic.supportingStepIds, ...decision.supportingStepIds.filter((id) => typeof id === "string").slice(0, 8)])]
    : deterministic.supportingStepIds;

  return {
    ...deterministic,
    verdict,
    confidence: Math.min(confidence, deterministic.missingRequirements.length > 0 ? 0.74 : 0.96),
    explanation,
    supportingStepIds,
    judge: {
      used: true,
      provider: "fireworks",
      reason: canUseAiVerdict ? "AI judge agreed with or downgraded the deterministic verdict." : "AI judge was kept as explanation only; deterministic required-evidence gate remained stricter."
    }
  };
}

function evidenceCoverageFor(requirements: EvidenceRequirement[], observations: PageObservation[]) {
  const metRequirements: EvidenceRequirementResult[] = [];
  const missingRequirements: EvidenceRequirementResult[] = [];
  for (const requirement of requirements) {
    const evidence = evidenceForRequirement(requirement, observations);
    if (evidence.length > 0) {
      metRequirements.push({
        id: requirement.id,
        label: requirement.label,
        evidence: evidence.slice(0, 4)
      });
    } else {
      missingRequirements.push({
        id: requirement.id,
        label: requirement.label,
        evidence: []
      });
    }
  }
  return { metRequirements, missingRequirements };
}

function bestCoherentCluster(goalSpec: GoalSpec, observations: PageObservation[]) {
  let best: {
    observation?: PageObservation;
    metRequirements: EvidenceRequirementResult[];
    supportingStepIds: string[];
    complete: boolean;
  } = {
    metRequirements: [],
    supportingStepIds: [],
    complete: goalSpec.mustFind.length === 0
  };

  for (const observation of observations) {
    if (isTopicDrift(goalSpec, observation)) {
      continue;
    }
    const coverage = evidenceCoverageFor(goalSpec.mustFind, [observation]);
    if (coverage.metRequirements.length > best.metRequirements.length) {
      best = {
        observation,
        metRequirements: coverage.metRequirements,
        supportingStepIds: observation.stepId ? [observation.stepId] : [],
        complete: coverage.missingRequirements.length === 0
      };
    }
    if (coverage.missingRequirements.length === 0) {
      return {
        observation,
        metRequirements: coverage.metRequirements,
        supportingStepIds: observation.stepId ? [observation.stepId] : [],
        complete: true
      };
    }
  }

  return best;
}

function missingRequirementsFor(
  requirements: EvidenceRequirement[],
  runEvidence: { metRequirements: EvidenceRequirementResult[]; missingRequirements: EvidenceRequirementResult[] },
  bestCluster: { complete: boolean; metRequirements: EvidenceRequirementResult[] }
) {
  if (runEvidence.missingRequirements.length > 0) {
    return runEvidence.missingRequirements;
  }
  if (bestCluster.complete) {
    return [];
  }

  const clusterMet = new Set(bestCluster.metRequirements.map((item) => item.id));
  const clusterMissing = requirements
    .filter((requirement) => !clusterMet.has(requirement.id))
    .map((requirement) => ({
      id: requirement.id,
      label: requirement.label,
      evidence: []
    }));

  return [
    ...clusterMissing,
    {
      id: "coherent_goal_evidence",
      label: "Coherent same-page goal evidence",
      evidence: []
    }
  ];
}

function evidenceForRequirement(requirement: EvidenceRequirement, observations: PageObservation[]) {
  const evidence: string[] = [];
  for (const observation of observations) {
    for (const candidate of textEvidenceForObservation(observation)) {
      if (requirementMatches(requirement, candidate.text)) {
        evidence.push(candidate.text);
      }
    }
  }
  return [...new Set(evidence.map((item) => sanitizeLine(item, 180)))].filter(Boolean);
}

function supportingStepIdsFor(requirements: EvidenceRequirement[], observations: PageObservation[]) {
  const ids = new Set<string>();
  for (const observation of observations) {
    if (!observation.stepId) continue;
    const texts = textEvidenceForObservation(observation).map((item) => item.text);
    if (requirements.some((requirement) => texts.some((text) => requirementMatches(requirement, text)))) {
      ids.add(observation.stepId);
    }
  }
  return [...ids];
}

function requirementMatches(requirement: EvidenceRequirement, value: string) {
  const normalized = normalizeEvidence(value);
  return requirement.anyOf.some((group) => group.every((term) => evidenceTermMatches(normalized, term)));
}

function evidenceTermMatches(normalizedEvidence: string, term: string) {
  const normalizedTerm = normalizeEvidence(term);
  if (!normalizedTerm) return false;
  if (normalizedEvidence.includes(normalizedTerm)) return true;

  if (normalizedTerm === "next.js") {
    return /\bnext(?:\.|\s|-)?js\b|\bnextjs\b/.test(normalizedEvidence);
  }
  if (normalizedTerm === "install") {
    return /\binstall(?:ed|ation|ing)?\b/.test(normalizedEvidence);
  }
  if (normalizedTerm === "quickstart") {
    return /\bquick\s?start\b/.test(normalizedEvidence);
  }
  if (normalizedTerm === "configure") {
    return /\bconfigur(?:e|ation|ing)?\b/.test(normalizedEvidence);
  }
  if (normalizedTerm === "customize") {
    return /\bcustomi[sz](?:e|ation|ing)?\b/.test(normalizedEvidence);
  }
  if (normalizedTerm === "compare") {
    return /\bcompar(?:e|ison|ing)?\b/.test(normalizedEvidence);
  }
  if (normalizedTerm === "from $") {
    return /\bfrom\s+\$|\$\d/.test(normalizedEvidence);
  }
  return false;
}

function textEvidenceForObservation(observation: PageObservation) {
  return [
    ...observation.evidenceCandidates,
    { source: "title" as const, text: observation.title },
    ...observation.headings.map((text) => ({ source: "heading" as const, text })),
    ...observation.visibleSnippets.map((text) => ({ source: "snippet" as const, text })),
    ...observation.actionCandidates.map((candidate) => ({ source: "action" as const, text: `${candidate.label} ${candidate.sectionLabel ?? ""} ${candidate.nearbyText ?? ""}` }))
  ];
}

function deterministicSafetyFailures(goalSpec: GoalSpec, observations: PageObservation[]) {
  const failures: string[] = [];
  for (const observation of observations) {
    for (const signal of observation.riskSignals) {
      if (signal.severity === "high" && ["auth_wall", "cross_origin", "private_data"].includes(signal.type)) {
        failures.push(signal.message);
      }
    }
    if (/\b\/(checkout|payment|pay|login|signin|signup|account)\b/i.test(observation.url)) {
      failures.push(`Navigation reached a forbidden or credential/payment URL path: ${observation.url}`);
    }
  }
  const latestObservation = observations.at(-1);
  if (latestObservation && isTopicDrift(goalSpec, latestObservation)) {
    failures.push(`Topic drift: latest evidence is about ${topicDriftLabel(goalSpec, latestObservation)} instead of ${goalSpec.topicFocus?.label ?? "the requested goal"}.`);
  }
  return [...new Set(failures)].slice(0, 5);
}

function isTopicDrift(goalSpec: GoalSpec, observation: PageObservation) {
  const focus = goalSpec.topicFocus;
  if (!focus) return false;
  const text = normalizeEvidence([
    observation.url,
    observation.title,
    ...observation.headings,
    ...observation.visibleSnippets.slice(0, 3)
  ].join(" "));
  const hasRequired = focus.requiredTerms.some((term) => evidenceTermMatches(text, term))
    || focus.relatedTerms.some((term) => evidenceTermMatches(text, term));
  const hasExcluded = focus.excludedTerms.some((term) => evidenceTermMatches(text, term));
  return hasExcluded && !hasRequired;
}

function topicDriftLabel(goalSpec: GoalSpec, observation: PageObservation) {
  const focus = goalSpec.topicFocus;
  if (!focus) return "another topic";
  const text = normalizeEvidence(`${observation.url} ${observation.title} ${observation.headings.join(" ")}`);
  return focus.excludedTerms.find((term) => evidenceTermMatches(text, term)) ?? "another topic";
}

function niceToFindCount(goalSpec: GoalSpec, observations: PageObservation[]) {
  return goalSpec.niceToFind.filter((requirement) => evidenceForRequirement(requirement, observations).length > 0).length;
}

function confidenceFor(input: {
  verdict: EvidenceVerifierResult["verdict"];
  metCount: number;
  missingCount: number;
  niceCount: number;
  safetyFailures: number;
}) {
  if (input.safetyFailures > 0) return 0.92;
  if (input.verdict === "SUCCEEDED") return Math.min(0.96, 0.78 + input.niceCount * 0.04);
  if (input.verdict === "BLOCKED") return 0.74;
  const total = Math.max(1, input.metCount + input.missingCount);
  return Math.max(0.32, Math.min(0.72, 0.32 + input.metCount / total * 0.32));
}

function explanationFor(input: {
  verdict: EvidenceVerifierResult["verdict"];
  metLabels: string[];
  missingLabels: string[];
  safetyFailures: string[];
}) {
  if (input.safetyFailures.length > 0) {
    return `Blocked by safety evidence: ${input.safetyFailures.join("; ")}`;
  }
  if (input.verdict === "SUCCEEDED") {
    return `Required evidence met: ${input.metLabels.join(", ")}.`;
  }
  if (input.verdict === "BLOCKED") {
    return `Blocked before required evidence was visible. Missing: ${input.missingLabels.join(", ") || "required goal evidence"}.`;
  }
  return `Partial evidence only. Met: ${input.metLabels.join(", ") || "none"}. Missing: ${input.missingLabels.join(", ") || "none"}.`;
}

function buildVerifierPrompt(input: VerifyEvidenceInput, deterministic: EvidenceVerifierResult) {
  return JSON.stringify({
    schema: {
      verdict: "SUCCEEDED | PARTIAL | BLOCKED | FAILED",
      confidence: "number from 0 to 1",
      explanation: "short evidence-based explanation",
      metRequirementIds: "array of supplied mustFind ids supported by observations",
      missingRequirementIds: "array of supplied mustFind ids not supported by observations",
      supportingStepIds: "array of observation step ids"
    },
    policy: [
      "Use only sanitized observations supplied here.",
      "Do not infer from brand knowledge or URLs alone unless the URL/title/snippet explicitly supports the requirement.",
      "Do not mark success if any deterministic missing requirement remains missing.",
      "Do not mark success if safety failures are present."
    ],
    goalSpec: input.goalSpec,
    deterministic,
    observations: input.observations.slice(-6).map((observation) => ({
      stepId: observation.stepId,
      url: observation.url,
      title: observation.title,
      headings: observation.headings,
      snippets: observation.visibleSnippets,
      pageCategory: observation.pageCategory,
      riskSignals: observation.riskSignals,
      evidenceCandidates: observation.evidenceCandidates.slice(0, 24)
    }))
  });
}

function verdictRank(verdict: EvidenceVerifierResult["verdict"]) {
  if (verdict === "FAILED") return 0;
  if (verdict === "BLOCKED") return 1;
  if (verdict === "PARTIAL") return 2;
  return 3;
}

function normalizeVerdict(value: unknown): EvidenceVerifierResult["verdict"] | undefined {
  return value === "SUCCEEDED" || value === "PARTIAL" || value === "BLOCKED" || value === "FAILED" ? value : undefined;
}

function normalizeConfidence(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : fallback;
}

function normalizeEvidence(value: string) {
  return value
    .toLowerCase()
    .replace(/next\.?\s?js/g, "next.js")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeLine(value: unknown, maxLength: number) {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, maxLength)
    : "";
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
