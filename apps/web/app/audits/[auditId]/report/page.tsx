import Link from "next/link";
import { AlertTriangle, CheckCircle2, Download, FileCode2, Share2, Sparkles } from "lucide-react";
import { demoAudit } from "@/lib/demo-data";

const severityStyles = {
  LOW: "bg-slate-100 text-slate-700",
  MEDIUM: "bg-amber/10 text-amber",
  HIGH: "bg-crimson/10 text-crimson",
  CRITICAL: "bg-crimson text-white"
};

export default async function ReportPage({ params }: { params: Promise<{ auditId: string }> }) {
  const { auditId } = await params;

  return (
    <main className="section">
      <div className="page-shell">
        <div className="flex flex-wrap justify-between gap-4">
          <div>
            <p className="font-mono text-sm font-semibold text-indigo">Report {auditId}</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-normal">Partial pass with product friction.</h1>
            <p className="mt-3 max-w-3xl leading-7 text-slate-700">
              The desktop path reaches the team screen, but mobile layout, task language, duplicate submits, and validation need work before real users arrive.
            </p>
          </div>
          <div className="flex flex-wrap content-start gap-3">
            <Link className="inline-flex min-h-11 items-center gap-2 rounded-ui border border-line px-4 py-3 font-semibold hover:bg-mist" href={`/audits/${auditId}/tests`}>
              <FileCode2 className="h-4 w-4" aria-hidden="true" />
              Tests
            </Link>
            <Link className="inline-flex min-h-11 items-center gap-2 rounded-ui bg-emerald px-4 py-3 font-semibold text-white hover:bg-emerald/90" href="/share/demo-share">
              <Share2 className="h-4 w-4" aria-hidden="true" />
              Share
            </Link>
          </div>
        </div>

        <section className="mt-8 grid gap-4 md:grid-cols-4">
          <div className="rounded-ui border border-line bg-ink p-5 text-white">
            <p className="font-mono text-sm text-slate-300">Score</p>
            <p className="mt-2 text-5xl font-semibold">{demoAudit.score}</p>
            <p className="mt-2 text-sm text-slate-300">{demoAudit.result}</p>
          </div>
          <div className="rounded-ui border border-line bg-panel p-5 md:col-span-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Sparkles className="h-5 w-5 text-indigo" aria-hidden="true" />
              Executive summary
            </h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <p className="rounded-ui bg-mist p-3 text-sm leading-6"><span className="block font-semibold">{demoAudit.successRate}</span> Persona success rate</p>
              <p className="rounded-ui bg-mist p-3 text-sm leading-6"><span className="block font-semibold">{demoAudit.timeToValue}</span> First meaningful blocker</p>
              <p className="rounded-ui bg-mist p-3 text-sm leading-6"><span className="block font-semibold">{demoAudit.preflight}</span> Run mode</p>
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-ui border border-line bg-panel p-5">
            <h2 className="text-lg font-semibold">Persona stories</h2>
            <div className="mt-4 grid gap-4">
              {demoAudit.runs.map((run) => (
                <div key={run.id} className="border-b border-line pb-4 last:border-b-0 last:pb-0">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold">{run.persona}</p>
                    <span className="font-mono text-xs text-slate-500">{run.status}</span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-700">{run.summary}</p>
                  <Link className="mt-3 inline-flex min-h-11 items-center rounded-ui border border-line px-3 py-2 text-sm font-semibold hover:bg-mist" href={`/audits/${auditId}/replay/${run.id}`}>
                    Replay evidence
                  </Link>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-ui border border-line bg-panel p-5">
            <h2 className="text-lg font-semibold">Friction points</h2>
            <div className="mt-4 grid gap-4">
              {demoAudit.issues.map((issue) => (
                <article key={issue.id} className="border-b border-line pb-4 last:border-b-0 last:pb-0">
                  <p className={`w-fit rounded-ui px-2 py-1 font-mono text-xs font-semibold ${severityStyles[issue.severity]}`}>
                    {issue.severity} · {issue.category}
                  </p>
                  <h3 className="mt-2 text-xl font-semibold">{issue.title}</h3>
                  <p className="mt-2 leading-7 text-slate-700">{issue.description}</p>
                  <p className="mt-3 text-sm font-semibold">Suggested fix: {issue.suggestedFix}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-ui border border-line bg-panel p-5">
            <h2 className="text-lg font-semibold">Suggested fixes</h2>
            <ol className="mt-4 grid gap-3">
              {demoAudit.suggestedFixes.map((fix) => (
                <li key={fix.title} className="flex gap-3 border-b border-line pb-3 last:border-b-0 last:pb-0">
                  <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald" aria-hidden="true" />
                  <div>
                    <p className="font-semibold">{fix.title}</p>
                    <p className="mt-1 text-sm leading-6 text-slate-700">{fix.owner} · {fix.impact}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div className="rounded-ui border border-line bg-panel p-5">
            <h2 className="text-lg font-semibold">Generated exports</h2>
            <div className="mt-4 grid gap-3">
              <Link className="inline-flex min-h-11 items-center justify-between gap-3 rounded-ui border border-line px-4 py-3 font-semibold hover:bg-mist" href={`/audits/${auditId}/tests`}>
                Playwright regression test
                <FileCode2 className="h-4 w-4 text-indigo" aria-hidden="true" />
              </Link>
              <a className="inline-flex min-h-11 items-center justify-between gap-3 rounded-ui border border-line px-4 py-3 font-semibold hover:bg-mist" href={`data:text/markdown;charset=utf-8,${encodeURIComponent(demoAudit.bugReport)}`} download="swarmproof-demo-bug.md">
                PM-ready bug report
                <Download className="h-4 w-4 text-indigo" aria-hidden="true" />
              </a>
              <p className="rounded-ui bg-crimson/10 p-3 text-sm leading-6 text-crimson">
                <AlertTriangle className="mr-1 inline h-4 w-4" aria-hidden="true" />
                No private URLs, credentials, screenshots, or raw target-page text are sent to Novus events.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
