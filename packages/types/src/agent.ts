export type PersonaMode = "normal" | "mobile" | "impatient" | "chaos" | "accessibility_lite";

export type PersonaConfig = {
  id: string;
  mode: PersonaMode;
  name: string;
  viewport: { width: number; height: number; isMobile?: boolean };
  behavioralLens: string;
  goalInterpretation: string;
  decisionBiases: string[];
  likelyFrictions: string[];
  stopCriteria: string[];
  behaviorRules: string[];
  chaosRules?: string[];
};

export const defaultPersonas: PersonaConfig[] = [
  {
    id: "normal",
    mode: "normal",
    name: "Normal evaluator",
    viewport: { width: 1440, height: 900 },
    behavioralLens: "Practical first-time evaluator looking for the shortest credible public path to the stated goal.",
    goalInterpretation: "Treat the goal as a realistic job-to-be-done and follow obvious information scent before secondary exploration.",
    decisionBiases: ["Prefer explicit goal-matching labels.", "Trust primary navigation and prominent CTAs first.", "Avoid clever detours unless the page gives clear evidence."],
    likelyFrictions: ["Ambiguous CTA copy", "Missing next step after a product page", "Pricing or docs hidden behind marketing language"],
    stopCriteria: ["Goal evidence is visible.", "Only unsafe signup, login, payment, checkout, sales, or private-data actions remain.", "The page no longer offers a safe same-origin next step."],
    behaviorRules: ["Try to complete the goal like a reasonable first-time user.", "Prefer direct, goal-matching calls to action before secondary exploration."]
  },
  {
    id: "mobile",
    mode: "mobile",
    name: "Mobile evaluator",
    viewport: { width: 390, height: 844, isMobile: true },
    behavioralLens: "Narrow-screen user who expects compact navigation, readable hierarchy, and tappable controls without patient digging.",
    goalInterpretation: "Find the same public goal from a phone-sized viewport, starting with mobile menus and visible sticky or above-fold actions.",
    decisionBiases: ["Open menu or navigation controls early.", "Prefer short labels and obvious tap targets.", "Treat dense pages, hidden CTAs, and horizontal overflow as friction."],
    likelyFrictions: ["Collapsed navigation hiding relevant links", "Tiny or clipped touch targets", "Sticky bars covering content", "Long dense pages with weak section labels"],
    stopCriteria: ["Goal evidence is visible in the mobile viewport.", "The next step is hidden, clipped, or unsafe.", "Continuing would require signup, login, checkout, payment, sales contact, or private data."],
    behaviorRules: ["Use a mobile viewport.", "Look for menu, touch, overflow, sticky bar, and small-screen CTA friction before assuming the flow is unavailable."]
  },
  {
    id: "chaos",
    mode: "chaos",
    name: "Chaos explorer",
    viewport: { width: 1366, height: 768 },
    behavioralLens: "Impatient but plausible public-site explorer who tries alternatives, backtracks, and notices confusing duplicate paths.",
    goalInterpretation: "Pursue the goal while probing safe adjacent routes that a distracted or impatient user might try.",
    decisionBiases: ["Favor compare, learn, details, configure, and backtrack paths.", "Notice duplicate or conflicting CTAs.", "Escalate confusion when labels compete or progress is unclear."],
    likelyFrictions: ["Duplicate CTAs", "Multiple similar paths with unclear difference", "Dead-end safe exploration", "Forms that look safe but ask for private or account data"],
    stopCriteria: ["A safe alternative confirms or blocks goal evidence.", "The page offers only commitment, auth, destructive, or private-data actions.", "Repeated alternatives do not change evidence."],
    behaviorRules: ["Try to complete the goal but behave like a messy real user.", "Explore safe alternatives such as compare, learn more, or back before any commitment boundary."],
    chaosRules: ["Double-click primary buttons once on owned demo flows.", "Try invalid email once on owned demo flows.", "Use back once before any irreversible action."]
  }
];

export function personaProfileForMode(mode: PersonaMode): PersonaConfig {
  const existing = defaultPersonas.find((persona) => persona.mode === mode);
  if (existing) return existing;

  if (mode === "accessibility_lite") {
    return {
      id: "accessibility_lite",
      mode,
      name: "Accessibility-lite evaluator",
      viewport: { width: 1280, height: 800 },
      behavioralLens: "Keyboard- and clarity-sensitive public-site evaluator looking for plain labels and visible structure.",
      goalInterpretation: "Complete the public goal using clear labels, landmarks, and readable hierarchy without claiming certification.",
      decisionBiases: ["Prefer explicit labels over icon-only controls.", "Notice missing structure or unclear affordances.", "Avoid hidden or private-data paths."],
      likelyFrictions: ["Icon-only navigation", "Jargon-heavy copy", "Unclear form labels", "Missing visible focus or structure"],
      stopCriteria: ["Goal evidence is clear.", "Only unclear, unsafe, or private actions remain.", "The page requires authentication or verification."],
      behaviorRules: ["Attempt the goal and report clarity, labeling, and navigation friction without claiming accessibility certification."]
    };
  }

  return {
    id: "impatient",
    mode,
    name: "Impatient evaluator",
    viewport: { width: 1280, height: 800 },
    behavioralLens: "Time-constrained user who tries the shortest safe path and gives up quickly when labels are vague.",
    goalInterpretation: "Find evidence for the goal with minimal navigation and limited patience for dense marketing pages.",
    decisionBiases: ["Prefer short direct labels.", "Avoid long detours.", "Treat repeated same-page outcomes as confusion."],
    likelyFrictions: ["Slow or vague navigation", "Marketing pages without clear next steps", "Repeated CTAs that do not change state"],
    stopCriteria: ["Goal evidence is reached.", "No short safe next step is visible.", "Only signup, login, payment, checkout, or private-data actions remain."],
    behaviorRules: ["Attempt the goal quickly and report friction clearly."]
  };
}
