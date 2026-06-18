export type AgentAction =
  | { type: "click_text"; text: string; reason: string }
  | { type: "fill_label"; label: string; value: string; reason: string }
  | { type: "select_label"; label: string; value: string; reason: string }
  | { type: "press"; key: string; reason: string }
  | { type: "goto"; url: string; reason: string }
  | { type: "wait"; ms: number; reason: string }
  | { type: "back"; reason: string }
  | { type: "screenshot"; reason: string }
  | { type: "done"; reason: string; evidence: string }
  | { type: "fail"; reason: string; evidence: string };

export type WorkerRunAgentRequest = {
  auditId: string;
  runId: string;
  targetUrl: string;
  goal: string;
  maxSteps: number;
  callbackBaseUrl: string;
};
