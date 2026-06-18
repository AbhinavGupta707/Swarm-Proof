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
    behaviorRules: ["Try to complete the goal like a reasonable first-time user."]
  },
  {
    id: "mobile",
    mode: "mobile",
    name: "Mobile user",
    viewport: { width: 390, height: 844, isMobile: true },
    behaviorRules: ["Use a mobile viewport.", "Notice hidden controls, overflow, and tiny tap targets."]
  },
  {
    id: "chaos",
    mode: "chaos",
    name: "Chaos user",
    viewport: { width: 1366, height: 768 },
    behaviorRules: ["Try to complete the goal but behave like a messy real user."],
    chaosRules: ["Double-click primary buttons once.", "Try invalid email once.", "Use back once."]
  }
];
