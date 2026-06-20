import Link from "next/link";
import { AlertTriangle, CheckCircle2, FileCode2, Share2, Sparkles } from "lucide-react";
import { createShareAsync } from "@swarmproof/db";
import { Events } from "@swarmproof/events";
import { TrackPageEvent } from "@/app/track-page-event";
import { BugReportDownloadLink } from "./bug-report-download";
import { auditPreflightLabel, auditSuccessRate, auditTimeToValue, bugReportForAudit, suggestedFixesForAudit } from "@/lib/audit-presenters";
import { getAuditForPage } from "@/lib/audit-data";

export const dynamic = "force-dynamic";

const severityStyles = {
  LOW: "bg-slate-100 text-slate-700",
  MEDIUM: "bg-amber/10 text-amber",
  HIGH: "bg-crimson/10 text-crimson",
  CRITICAL: "bg-crimson text-white"
};

export default async function ReportPage({ params }: { params: Promise<{ auditId: string }> }) {
  const { auditId } = await params;
  const audit = await getAuditForPage(auditId);
  let share = { shareToken: audit.shareToken ?? "demo-share" };
  try {
    share = audit.id === auditId ? await createShareAsync(audit.id, process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000") : share;
  } catch {
    share = { shareToken: audit.shareToken ?? "demo-share" };
  }
  const report = audit.report;
  const fixes = suggestedFixesForAudit(audit);
  const bugReport = bugReportForAudit(audit);
  const headline = reportHeadline(audit);

  return (
    <main className="section">
      <TrackPageEvent
        name={Events.ReportGenerated}
        props={{
          target_kind: audit.preflight?.isDemoTarget ? "demo" : "public",
          issue_count: audit.issues.length,
          persona_count: audit.runs.length,
          score: audit.score,
          outcome: report?.outcome ?? audit.status
        }}
      />
      <div className="page-shell">
        <div className="flex flex-wrap justify-between gap-4">
          <div>
            <p className="font-mono text-sm font-semibold text-indigo">Report {audit.id}</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-normal">
              {headline}
            </h1>
            <p className="mt-3 max-w-3xl leading-7 text-slate-700">
              {report?.summary ?? "The desktop path reaches the team screen, but mobile layout, task language, duplicate submits, and validation need work before real users arrive."}
            </p>
          </div>
          <div className="flex flex-wrap content-start gap-3">
            <Link className="inline-flex min-h-11 items-center gap-2 rounded-ui border border-line px-4 py-3 font-semibold hover:bg-mist" href={`/audits/${audit.id}/tests`}>
              <FileCode2 className="h-4 w-4" aria-hidden="true" />
              Tests
            </Link>
            <Link className="inline-flex min-h-11 items-center gap-2 rounded-ui bg-emerald px-4 py-3 font-semibold text-white hover:bg-emerald/90" href={`/share/${share.shareToken}`}>
              <Share2 className="h-4 w-4" aria-hidden="true" />
              Share
            </Link>
          </div>
        </div>

        <section className="mt-8 grid gap-4 md:grid-cols-4">
          <div className="rounded-ui border border-line bg-ink p-5 text-white">
            <p className="font-mono text-sm text-slate-300">Score</p>
            <p className="mt-2 text-5xl font-semibold">{audit.score}</p>
            <p className="mt-2 text-sm text-slate-300">{report?.outcome ?? audit.status}</p>
          </div>
          <div className="rounded-ui border border-line bg-panel p-5 md:col-span-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Sparkles className="h-5 w-5 text-indigo" aria-hidden="true" />
              Executive summary
            </h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <p className="rounded-ui bg-mist p-3 text-sm leading-6"><span className="block font-semibold">{auditSuccessRate(audit)}</span> Persona success rate</p>
              <p className="rounded-ui bg-mist p-3 text-sm leading-6"><span className="block font-semibold">{auditTimeToValue(audit)}</span> First meaningful blocker</p>
              <p className="rounded-ui bg-mist p-3 text-sm leading-6"><span className="block font-semibold">{auditPreflightLabel(audit)}</span> Run mode</p>
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-ui border border-line bg-panel p-5">
            <h2 className="text-lg font-semibold">Persona stories</h2>
            <div className="mt-4 grid gap-4">
              {audit.runs.length ? audit.runs.map((run) => (
                <div key={run.id} className="border-b border-line pb-4 last:border-b-0 last:pb-0">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold">{run.persona}</p>
                    <span className="font-mono text-xs text-slate-500">{run.status}</span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-700">{run.summary}</p>
                  <Link className="mt-3 inline-flex min-h-11 items-center rounded-ui border border-line px-3 py-2 text-sm font-semibold hover:bg-mist" href={`/audits/${audit.id}/replay/${run.id}`}>
                    Replay evidence
                  </Link>
                </div>
              )) : (
                <p className="rounded-ui border border-dashed border-line bg-mist p-4 text-sm font-semibold text-slate-600">
                  Waiting for persona runs to start.
                </p>
              )}
            </div>
          </div>

          <div className="rounded-ui border border-line bg-panel p-5">
            <h2 className="text-lg font-semibold">Friction points</h2>
            <div className="mt-4 grid gap-4">
              {audit.issues.length ? audit.issues.map((issue) => (
                <article key={issue.id} className="border-b border-line pb-4 last:border-b-0 last:pb-0">
                  <p className={`w-fit rounded-ui px-2 py-1 font-mono text-xs font-semibold ${severityStyles[issue.severity]}`}>
                    {issue.severity} · {issue.category}
                  </p>
                  <h3 className="mt-2 text-xl font-semibold">{issue.title}</h3>
                  <p className="mt-2 leading-7 text-slate-700">{issue.description}</p>
                  <p className="mt-3 text-sm font-semibold">Suggested fix: {issue.suggestedFix}</p>
                </article>
              )) : (
                <p className="rounded-ui border border-dashed border-line bg-mist p-4 text-sm font-semibold text-slate-600">
                  No friction points have been recorded yet.
                </p>
              )}
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-ui border border-line bg-panel p-5">
            <h2 className="text-lg font-semibold">Suggested fixes</h2>
            <ol className="mt-4 grid gap-3">
              {fixes.map((fix) => (
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
              <Link className="inline-flex min-h-11 items-center justify-between gap-3 rounded-ui border border-line px-4 py-3 font-semibold hover:bg-mist" href={`/audits/${audit.id}/tests`}>
                Playwright regression test
                <FileCode2 className="h-4 w-4 text-indigo" aria-hidden="true" />
              </Link>
              <BugReportDownloadLink
                href={`data:text/markdown;charset=utf-8,${encodeURIComponent(bugReport)}`}
                targetKind={audit.preflight?.isDemoTarget ? "demo" : "public"}
                issueCount={audit.issues.length}
                score={audit.score}
                outcome={report?.outcome ?? audit.status}
              />
              <p className="rounded-ui bg-mist p-3 text-sm leading-6 text-slate-600">
                <AlertTriangle className="mr-1 inline h-4 w-4 text-indigo" aria-hidden="true" />
                Event telemetry is privacy-safe: no private URLs, credentials, screenshots, or raw target-page text are sent to analytics.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function reportHeadline(audit: Awaited<ReturnType<typeof getAuditForPage>>) {
  if (audit.status === "RUNNING") return "Evidence is still coming in.";
  if (audit.runs.some((run) => run.status === "TIMED_OUT")) return "Partial report ready after timeout.";
  if (audit.issues.some((issue) => issue.category === "Worker crash")) return "Partial report ready after worker crash.";
  if (audit.runs.some((run) => run.status === "BLOCKED")) return "Safety-limited partial report ready.";
  if (audit.report?.outcome === "fail") return "Needs fixes before real traffic.";
  if (audit.report?.outcome === "pass") return "Clean pass for this audit path.";
  return "Partial pass with product friction.";
}
