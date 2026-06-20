import type { PersonaMode } from "./agent";

export type EvidenceRequirement = {
  id: string;
  label: string;
  anyOf: string[][];
  source: "goal" | "inferred" | "safety";
};

export type GoalSpec = {
  version: 1;
  goal: string;
  personaMode: PersonaMode;
  personaInterpretation: string;
  topicFocus?: GoalTopicFocus;
  mustFind: EvidenceRequirement[];
  niceToFind: EvidenceRequirement[];
  forbiddenActions: string[];
  successRubric: string[];
  stopConditions: string[];
  allowedScope: {
    origin: string;
    sameOriginOnly: boolean;
    allowFormActions: boolean;
    notes: string[];
  };
  compiledBy: "deterministic" | "llm";
};

export type GoalTopicFocus = {
  label: string;
  requiredTerms: string[];
  relatedTerms: string[];
  excludedTerms: string[];
};

export type ObservedActionKind = "link" | "button" | "input";
export type ObservedActionCategory =
  | "docs"
  | "pricing"
  | "product"
  | "search"
  | "navigation"
  | "commerce"
  | "support"
  | "auth"
  | "unsafe"
  | "legal"
  | "unknown";

export type ObservedActionCandidate = {
  kind: ObservedActionKind;
  label: string;
  ordinal: number;
  href?: string;
  sameOrigin?: boolean;
  inputType?: string;
  disabled?: boolean;
  sectionLabel?: string;
  nearbyText?: string;
  category?: ObservedActionCategory;
};

export type PageRiskSignal = {
  type: "auth_wall" | "unsafe_action" | "cookie_modal" | "no_action" | "cross_origin" | "private_data" | "unknown";
  severity: "low" | "medium" | "high";
  message: string;
};

export type EvidenceCandidate = {
  source: "title" | "heading" | "snippet" | "action" | "url";
  text: string;
  requirementIds?: string[];
};

export type PageObservation = {
  version: 1;
  stepId?: string;
  url: string;
  title: string;
  headings: string[];
  visibleSnippets: string[];
  links: ObservedActionCandidate[];
  buttons: ObservedActionCandidate[];
  forms: ObservedActionCandidate[];
  actionCandidates: ObservedActionCandidate[];
  pageCategory: ObservedActionCategory | "auth_wall" | "empty";
  riskSignals: PageRiskSignal[];
  evidenceCandidates: EvidenceCandidate[];
  capturedAt: string;
};

export type PlannerStepDiagnostic = {
  type: "click" | "fill" | "observe" | "fail" | "none";
  reason: string;
  confidence: number;
  expectedEvidence?: string;
  candidateLabel?: string;
  candidateKind?: ObservedActionKind;
  candidateCategory?: ObservedActionCategory;
};

export type EvidenceRequirementResult = {
  id: string;
  label: string;
  evidence: string[];
};

export type EvidenceVerifierResult = {
  verdict: "SUCCEEDED" | "PARTIAL" | "BLOCKED" | "FAILED";
  confidence: number;
  metRequirements: EvidenceRequirementResult[];
  missingRequirements: EvidenceRequirementResult[];
  explanation: string;
  supportingStepIds: string[];
  safetyFailures: string[];
  judge?: {
    used: boolean;
    provider: "deterministic" | "fireworks";
    reason?: string;
  };
};
