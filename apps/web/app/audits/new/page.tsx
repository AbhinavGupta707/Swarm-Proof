import { Suspense } from "react";
import { Bot, Gauge, MonitorSmartphone, RotateCcw, ShieldCheck } from "lucide-react";
import { demoAudit } from "@/lib/demo-data";
import { AuditForm } from "./audit-form";

const modes = [
  { id: "normal", label: "Normal", icon: Bot, detail: "Reasonable first-time user" },
  { id: "mobile", label: "Mobile", icon: MonitorSmartphone, detail: "390px viewport, touch targets" },
  { id: "chaos", label: "Chaos", icon: RotateCcw, detail: "Double-clicks, invalid input" },
  { id: "accessibility-lite", label: "A11y lite", icon: ShieldCheck, detail: "Labels and focus checks" }
];

export default function NewAuditPage() {
  return (
    <main className="section surface-grid">
      <div className="page-shell grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
        <aside>
          <p className="font-mono text-sm font-semibold text-indigo">New audit</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-normal">Give the swarm a goal.</h1>
          <p className="mt-4 leading-7 text-slate-700">
            Start with the judge-safe demo target, or submit a public URL for safety preflight and an execution-ready report.
          </p>
          <div className="mt-6 grid gap-3">
            {demoAudit.metrics.map((metric) => (
              <div key={metric.label} className="flex items-center justify-between gap-4 border-b border-line pb-3">
                <div>
                  <p className="font-semibold">{metric.label}</p>
                  <p className="mt-1 text-sm text-slate-600">{metric.detail}</p>
                </div>
                <p className="font-mono text-2xl font-semibold">{metric.value}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 rounded-ui border border-line bg-panel p-4">
            <p className="flex items-center gap-2 font-semibold">
              <Gauge className="h-4 w-4 text-indigo" aria-hidden="true" />
              Persona plan
            </p>
            <div className="mt-4 grid gap-3">
              {modes.map((mode) => (
                <div key={mode.id} className="flex items-start gap-3 text-sm">
                  <mode.icon className="mt-0.5 h-4 w-4 shrink-0 text-indigo" aria-hidden="true" />
                  <p>
                    <span className="font-semibold">{mode.label}:</span> {mode.detail}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </aside>
        <Suspense fallback={<div className="rounded-ui border border-line bg-panel p-5">Loading audit form...</div>}>
          <AuditForm />
        </Suspense>
      </div>
    </main>
  );
}
