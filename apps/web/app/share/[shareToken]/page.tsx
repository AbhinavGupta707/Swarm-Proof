import Link from "next/link";
import { Eye, FileCode2, LockKeyhole, ShieldCheck } from "lucide-react";
import { Events } from "@swarmproof/events";
import { TrackPageEvent } from "@/app/track-page-event";
import { auditMetrics } from "@/lib/audit-presenters";
import { getSharedAuditForPage } from "@/lib/audit-data";

export const dynamic = "force-dynamic";

export default async function SharePage({ params }: { params: Promise<{ shareToken: string }> }) {
  const { shareToken } = await params;
  const audit = await getSharedAuditForPage(shareToken);
  const metrics = auditMetrics(audit);
  const partial = audit.runs.some((run) => ["FAILED", "BLOCKED", "TIMED_OUT"].includes(run.status));

  return (
    <main className="section">
      <TrackPageEvent
        name={Events.ShareCreated}
        props={{
          target_kind: audit.preflight?.isDemoTarget ? "demo" : "public",
          issue_count: audit.issues.length,
          public_report: true
        }}
      />
      <div className="page-shell">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-sm font-semibold text-indigo">Shared report {shareToken}</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-normal">{partial ? "SwarmProof partial audit evidence" : "SwarmProof audit evidence"}</h1>
            <p className="mt-3 max-w-3xl leading-7 text-slate-700">
              Public read-only evidence for: {audit.goal}. {partial ? "Some personas stopped early, timed out, or were safety-blocked, and the report preserves the evidence captured before that point. " : ""}This view omits secrets, credentials, raw target content, and private URLs.
            </p>
          </div>
          <Link className="inline-flex min-h-11 items-center gap-2 rounded-ui border border-line px-4 py-3 font-semibold hover:bg-mist" href="/novus-proof">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            Novus proof
          </Link>
        </div>

        <section className="mt-8 grid gap-4 md:grid-cols-4">
          <div className="rounded-ui border border-line bg-ink p-5 text-white">
            <p className="font-mono text-sm text-slate-300">Score</p>
            <p className="mt-2 text-5xl font-semibold">{audit.score}</p>
          </div>
          {metrics.slice(0, 3).map((metric) => (
            <div key={metric.label} className="rounded-ui border border-line bg-panel p-5">
              <p className="font-mono text-2xl font-semibold">{metric.value}</p>
              <p className="mt-1 font-semibold">{metric.label}</p>
              <p className="mt-1 text-sm text-slate-600">{metric.detail}</p>
            </div>
          ))}
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-[1fr_0.85fr]">
          <div className="rounded-ui border border-line bg-panel p-5">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Eye className="h-5 w-5 text-indigo" aria-hidden="true" />
              Public findings
            </h2>
            <div className="mt-4 grid gap-4">
              {audit.issues.map((issue) => (
                <article key={issue.id} className="border-b border-line pb-4 last:border-b-0 last:pb-0">
                  <p className="font-mono text-xs font-semibold text-crimson">{issue.severity} · {issue.category}</p>
                  <h3 className="mt-2 text-lg font-semibold">{issue.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-700">{issue.description}</p>
                </article>
              ))}
            </div>
          </div>

          <aside className="grid content-start gap-4">
            <section className="rounded-ui border border-line bg-panel p-5">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <FileCode2 className="h-5 w-5 text-indigo" aria-hidden="true" />
                Generated test preview
              </h2>
              <pre className="mt-4 max-h-80 overflow-x-auto rounded-ui bg-ink p-4 text-sm leading-6 text-white">
                <code>{audit.generatedTest}</code>
              </pre>
            </section>
            <section className="rounded-ui border border-line bg-panel p-5">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <LockKeyhole className="h-5 w-5 text-emerald" aria-hidden="true" />
                Privacy boundary
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-700">
                Event properties are limited to counts, modes, categories, and state transitions. Replay frames use product-safe evidence summaries.
              </p>
            </section>
          </aside>
        </section>
      </div>
    </main>
  );
}
