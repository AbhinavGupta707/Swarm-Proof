import Link from "next/link";
import { AlertTriangle, CheckCircle2, Download, FileCode2, GitPullRequest, Share2, Sparkles } from "lucide-react";
import { createShareAsync } from "@swarmproof/db";
import { Events } from "@swarmproof/events";
import { TrackPageEvent } from "@/app/track-page-event";
import { BugReportDownloadLink } from "./bug-report-download";
import {
  actionPlanMarkdownForAudit,
  auditPreflightLabel,
  auditSuccessRate,
  auditTimeToValue,
  bugReportForAudit,
  suggestedFixesForAudit,
  technicalArtifactsForAudit,
  userFacingIssuesForAudit
} from "@/lib/audit-presenters";
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
  const actionPlan = report?.reportJson.actionPlan;
  const actionPlanMarkdown = actionPlanMarkdownForAudit(audit);
  const headline = reportHeadline(audit);
  const userIssues = userFacingIssuesForAudit(audit);
  const technicalArtifacts = technicalArtifactsForAudit(audit);

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
              {audit.runs.length ? audit.runs.map((run) => {
                const missingEvidence = run.verifierResult?.missingRequirements.map((item) => item.label).filter(Boolean) ?? [];
                return (
                  <div key={run.id} className="border-b border-line pb-4 last:border-b-0 last:pb-0">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold">{run.persona}</p>
                      <span className="font-mono text-xs text-slate-500">{run.status}</span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-700">{run.summary}</p>
                    <p className="mt-2 rounded-ui bg-mist px-3 py-2 text-xs leading-5 text-slate-600">
                      <span className="font-semibold text-slate-900">Verifier:</span>{" "}
                      {run.verifierResult ? run.verifierResult.verdict : "not recorded"}
                      {run.verifierResult ? ` · Missing: ${missingEvidence.length ? missingEvidence.slice(0, 2).join(", ") : "none"}` : ""}
                    </p>
                    <Link className="mt-3 inline-flex min-h-11 items-center rounded-ui border border-line px-3 py-2 text-sm font-semibold hover:bg-mist" href={`/audits/${audit.id}/replay/${run.id}`}>
                      Replay evidence
                    </Link>
                  </div>
                );
              }) : (
                <p className="rounded-ui border border-dashed border-line bg-mist p-4 text-sm font-semibold text-slate-600">
                  Waiting for persona runs to start.
                </p>
              )}
            </div>
          </div>

          <div className="rounded-ui border border-line bg-panel p-5">
            <h2 className="text-lg font-semibold">User-facing findings</h2>
            <div className="mt-4 grid gap-4">
              {userIssues.length ? userIssues.map((issue) => (
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
                  No user-facing blocker was found. The personas reached verifier-backed evidence for the requested public path.
                </p>
              )}
            </div>
            {technicalArtifacts.length ? (
              <div className="mt-6 border-t border-line pt-5">
                <h3 className="text-base font-semibold">Technical artifacts</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  These are console or network signals from the target site. They are useful engineering follow-up, but they are not treated as user-flow blockers unless they stop the persona.
                </p>
                <div className="mt-4 grid gap-4">
                  {technicalArtifacts.map((issue) => (
                    <article key={issue.id} className="border-b border-line pb-4 last:border-b-0 last:pb-0">
                      <p className={`w-fit rounded-ui px-2 py-1 font-mono text-xs font-semibold ${severityStyles[issue.severity]}`}>
                        {issue.severity} · {issue.category}
                      </p>
                      <h4 className="mt-2 text-lg font-semibold">{issue.title}</h4>
                      <p className="mt-2 text-sm leading-6 text-slate-700">{issue.description}</p>
                      <p className="mt-3 text-sm font-semibold">Engineering follow-up: {issue.suggestedFix}</p>
                    </article>
                  ))}
                </div>
              </div>
            ) : null}
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
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <GitPullRequest className="h-5 w-5 text-indigo" aria-hidden="true" />
              PR-ready suggestion
            </h2>
            {actionPlan ? (
              <div className="mt-4 grid gap-4">
                <div className="rounded-ui bg-mist p-3 text-sm leading-6">
                  <p className="font-semibold">{actionPlan.pullRequestDraft.title}</p>
                  <p className="mt-1 font-mono text-xs text-slate-600">{actionPlan.pullRequestDraft.branchName}</p>
                </div>
                <div className="grid gap-3">
                  {actionPlan.items.slice(0, 3).map((item) => (
                    <article key={item.title} className="border-b border-line pb-3 last:border-b-0 last:pb-0">
                      <p className="font-mono text-xs font-semibold text-indigo">{item.priority} · {item.owner}</p>
                      <h3 className="mt-1 font-semibold">{item.title}</h3>
                      <p className="mt-1 text-sm leading-6 text-slate-700">{item.suggestedChange}</p>
                    </article>
                  ))}
                </div>
                <p className="text-sm leading-6 text-slate-600">
                  Likely files: {actionPlan.pullRequestDraft.filesChanged.slice(0, 3).join(", ")}
                </p>
              </div>
            ) : (
              <p className="mt-4 rounded-ui border border-dashed border-line bg-mist p-4 text-sm font-semibold text-slate-600">
                Waiting for report synthesis to produce a PR suggestion.
              </p>
            )}
          </div>
        </section>

        <section className="mt-6">
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
              <a
                className="inline-flex min-h-11 items-center justify-between gap-3 rounded-ui border border-line px-4 py-3 font-semibold hover:bg-mist"
                href={`data:text/markdown;charset=utf-8,${encodeURIComponent(actionPlanMarkdown)}`}
                download="swarmproof-pr-suggestion.md"
              >
                PR suggestion brief
                <Download className="h-4 w-4 text-indigo" aria-hidden="true" />
              </a>
              <p className="rounded-ui bg-mist p-3 text-sm leading-6 text-slate-600">
                <AlertTriangle className="mr-1 inline h-4 w-4 text-indigo" aria-hidden="true" />
                Privacy note: screenshots and raw target-page text stay out of Novus/Pendo analytics events. This report shows sanitized evidence summaries for review.
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
  if (audit.runs.some((run) => run.status === "BLOCKED")) return "Partial report ready with verifier blocker.";
  if (audit.report?.outcome === "fail") return "Needs fixes before real traffic.";
  if (audit.report?.outcome === "pass" && technicalArtifactsForAudit(audit).length > 0) return "Goal verified with technical artifacts.";
  if (audit.report?.outcome === "pass") return "Clean pass for this audit path.";
  return "Partial pass with product friction.";
}
