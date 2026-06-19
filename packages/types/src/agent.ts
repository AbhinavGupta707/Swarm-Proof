export type PersonaMode = "normal" | "mobile" | "impatient" | "chaos" | "accessibility_lite";

export type PersonaConfig = {
  id: string;
  mode: PersonaMode;
  name: string;
  viewport: { width: number; height: number; isMobile?: boolean };
  behaviorRules: string[];
  chaosRules?: string[];
};

export const defaultPersonas: PersonaConfig[] = [
  {
    id: "normal",
    mode: "normal",
    name: "Normal user",
    viewport: { width: 1440, height: 900 },
    behaviorRules: ["Try to complete the goal like a reasonable first-time user.", "Prefer direct, goal-matching calls to action before secondary exploration."]
  },
  {
    id: "mobile",
    mode: "mobile",
    name: "Mobile user",
    viewport: { width: 390, height: 844, isMobile: true },
    behaviorRules: ["Use a mobile viewport.", "Look for menu, touch, overflow, sticky bar, and small-screen CTA friction before assuming the flow is unavailable."]
  },
  {
    id: "chaos",
    mode: "chaos",
    name: "Chaos user",
    viewport: { width: 1366, height: 768 },
    behaviorRules: ["Try to complete the goal but behave like a messy real user.", "Explore safe alternatives such as compare, learn more, or back before any commitment boundary."],
    chaosRules: ["Double-click primary buttons once on owned demo flows.", "Try invalid email once on owned demo flows.", "Use back once before any irreversible action."]
  }
];
