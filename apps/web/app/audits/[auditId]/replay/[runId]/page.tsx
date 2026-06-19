import Link from "next/link";
import { Camera, Monitor, Route, Smartphone } from "lucide-react";
import { auditTimeline, evidenceFramesForRun } from "@/lib/audit-presenters";
import { getAuditForPage } from "@/lib/audit-data";

export const dynamic = "force-dynamic";

export default async function ReplayPage({ params }: { params: Promise<{ auditId: string; runId: string }> }) {
  const { auditId, runId } = await params;
  const audit = getAuditForPage(auditId);
  const run = audit.runs.find((item) => item.id === runId) ?? audit.runs[0];
  const frames = run ? evidenceFramesForRun(audit, run.id) : [];
  const steps = run ? auditTimeline(audit).filter((step) => step.runId === run.id) : [];

  return (
    <main className="section surface-grid">
      <div className="page-shell">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-sm font-semibold text-indigo">Replay {run?.id ?? runId}</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-normal">{run?.persona ?? "Persona"} evidence timeline</h1>
            <p className="mt-3 max-w-3xl leading-7 text-slate-700">{run?.summary ?? "Evidence captured during this audit run."}</p>
          </div>
          <Link className="inline-flex min-h-11 items-center rounded-ui bg-emerald px-4 py-3 font-semibold text-white hover:bg-emerald/90" href={`/audits/${audit.id}/report`}>
            Back to report
          </Link>
        </div>

        <section className="mt-8 grid gap-4 md:grid-cols-3">
          {frames.length ? frames.map((frame) => (
            <article key={frame.id} className="rounded-ui border border-line bg-panel p-4 shadow-sm">
              <div className="aspect-video rounded-ui border border-line bg-mist p-3">
                {frame.screenshotUrl ? (
                  <img className="h-full w-full rounded-ui object-cover" src={frame.screenshotUrl} alt={`Evidence frame for ${frame.title}`} />
                ) : (
                  <div className="flex h-full flex-col justify-between">
                    <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        {frame.viewport.startsWith("390") ? <Smartphone className="h-3.5 w-3.5" aria-hidden="true" /> : <Monitor className="h-3.5 w-3.5" aria-hidden="true" />}
                        {frame.viewport}
                      </span>
                      <Camera className="h-3.5 w-3.5" aria-hidden="true" />
                    </div>
                    <div className="grid gap-2">
                      <div className="h-3 w-2/3 rounded bg-slate-300" />
                      <div className="h-3 w-4/5 rounded bg-slate-200" />
                      <div className="h-9 w-32 rounded-ui bg-emerald/20" />
                    </div>
                  </div>
                )}
              </div>
              <p className="mt-4 font-mono text-xs text-slate-500">{frame.step}</p>
              <h2 className="mt-1 text-lg font-semibold">{frame.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-700">{frame.state}</p>
              <p className="mt-3 flex items-start gap-2 text-sm leading-6 text-slate-700">
                <Route className="mt-1 h-4 w-4 shrink-0 text-indigo" aria-hidden="true" />
                {frame.finding}
              </p>
            </article>
          )) : (
            <div className="rounded-ui border border-dashed border-line bg-panel p-5 text-sm font-semibold text-slate-600 md:col-span-3">
              Waiting for screenshot evidence from this persona.
            </div>
          )}
        </section>

        <section className="mt-6 rounded-ui border border-line bg-panel p-5">
          <h2 className="text-lg font-semibold">Event trail</h2>
          {steps.length ? (
            <ol className="mt-4 grid gap-3">
              {steps.map((step) => (
              <li key={step.id} className="grid gap-2 border-b border-line pb-3 last:border-b-0 last:pb-0 sm:grid-cols-[4rem_1fr]">
                <span className="font-mono text-sm text-slate-500">{step.time}</span>
                <p className="text-sm leading-6 text-slate-700"><span className="font-semibold text-ink">{step.label}:</span> {step.result}</p>
              </li>
              ))}
            </ol>
          ) : (
            <p className="mt-4 rounded-ui border border-dashed border-line bg-mist p-4 text-sm font-semibold text-slate-600">
              Waiting for the first worker callback.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
