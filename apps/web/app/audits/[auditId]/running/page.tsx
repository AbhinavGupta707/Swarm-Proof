import Link from "next/link";
import { AlertTriangle, CheckCircle2, CircleStop, Clock3, Eye, Loader2, Monitor, Smartphone, Zap } from "lucide-react";
import { demoAudit } from "@/lib/demo-data";

const statusStyles = {
  BLOCKED: "bg-amber/10 text-amber",
  FAILED: "bg-crimson/10 text-crimson",
  SUCCEEDED: "bg-emerald/10 text-emerald",
  RUNNING: "bg-indigo/10 text-indigo",
  PENDING: "bg-slate-100 text-slate-600"
};

const stepIcons = {
  passed: CheckCircle2,
  warning: AlertTriangle,
  failed: AlertTriangle
};

export default async function RunningAuditPage({ params }: { params: Promise<{ auditId: string }> }) {
  const { auditId } = await params;

  return (
    <main className="section surface-grid">
      <div className="page-shell">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-sm font-semibold text-indigo">Audit {auditId}</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-normal">Personas are testing the goal.</h1>
            <p className="mt-3 max-w-3xl leading-7 text-slate-700">{demoAudit.goal}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button className="inline-flex min-h-11 items-center gap-2 rounded-ui border border-line bg-panel px-4 py-3 font-semibold hover:bg-mist" type="button">
              <CircleStop className="h-4 w-4" aria-hidden="true" />
              Stop
            </button>
            <Link className="inline-flex min-h-11 items-center rounded-ui bg-emerald px-4 py-3 font-semibold text-white hover:bg-emerald/90" href={`/audits/${auditId}/report`}>
              Open report
            </Link>
          </div>
        </div>

        <section className="mt-8 grid gap-4 md:grid-cols-4">
          {demoAudit.metrics.map((metric) => (
            <div key={metric.label} className="rounded-ui border border-line bg-panel p-4">
              <p className="font-mono text-2xl font-semibold">{metric.value}</p>
              <p className="mt-1 font-semibold">{metric.label}</p>
              <p className="mt-1 text-sm text-slate-600">{metric.detail}</p>
            </div>
          ))}
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-3">
          {demoAudit.runs.map((run) => (
            <article key={run.id} className="rounded-ui border border-line bg-panel p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{run.persona}</p>
                  <p className="mt-1 font-mono text-xs uppercase text-slate-500">{run.mode}</p>
                </div>
                <span className={`rounded-ui px-2 py-1 font-mono text-xs font-semibold ${statusStyles[run.status]}`}>
                  {run.status}
                </span>
              </div>
              <div className="mt-4 aspect-video rounded-ui border border-line bg-mist p-3">
                <div className="flex h-full flex-col justify-between">
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      {run.mode === "mobile" ? <Smartphone className="h-3.5 w-3.5" aria-hidden="true" /> : <Monitor className="h-3.5 w-3.5" aria-hidden="true" />}
                      {run.mode === "mobile" ? "390 x 844" : "desktop viewport"}
                    </span>
                    <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                  </div>
                  <div className="grid gap-2">
                    <div className="h-3 w-3/4 rounded bg-slate-300" />
                    <div className="h-3 w-1/2 rounded bg-slate-200" />
                    <div className={`h-8 w-28 rounded-ui ${run.status === "FAILED" ? "bg-crimson/20" : "bg-emerald/20"}`} />
                  </div>
                </div>
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-700">{run.summary}</p>
              <Link className="mt-4 inline-flex min-h-11 items-center rounded-ui border border-line px-3 py-2 text-sm font-semibold hover:bg-mist" href={`/audits/${auditId}/replay/${run.id}`}>
                View replay
              </Link>
            </article>
          ))}
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-ui border border-line bg-panel p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Step log</h2>
              <span className="inline-flex items-center gap-2 font-mono text-xs font-semibold text-indigo">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                replaying demo run
              </span>
            </div>
            <ol className="mt-5 grid gap-4">
              {demoAudit.steps.map((step) => {
                const Icon = stepIcons[step.status];
                return (
                  <li key={step.id} className="grid gap-3 border-b border-line pb-4 last:border-b-0 last:pb-0 sm:grid-cols-[4rem_1fr]">
                    <span className="font-mono text-sm text-slate-500">{step.time}</span>
                    <div>
                      <p className="flex items-center gap-2 font-semibold">
                        <Icon className={step.status === "passed" ? "h-4 w-4 text-emerald" : "h-4 w-4 text-amber"} aria-hidden="true" />
                        {step.label}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-slate-700">{step.result}</p>
                      <p className="mt-2 font-mono text-xs text-slate-500">{step.url} · {step.evidence}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
          <aside className="rounded-ui border border-line bg-ink p-5 text-white shadow-sm">
            <p className="flex items-center gap-2 font-mono text-sm font-semibold text-emerald">
              <Zap className="h-4 w-4" aria-hidden="true" />
              Live summary
            </p>
            <h2 className="mt-3 text-2xl font-semibold">4 issues found while the goal was in progress.</h2>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              The run is complete in deterministic demo mode, so the report, generated test, share link, and Novus proof are ready to inspect.
            </p>
            <div className="mt-5 grid gap-3 text-sm">
              <p className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-emerald" aria-hidden="true" /> {demoAudit.timeToValue}</p>
              <p className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber" aria-hidden="true" /> {demoAudit.successRate}</p>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
