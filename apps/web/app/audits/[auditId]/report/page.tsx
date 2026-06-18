import Link from "next/link";
import { demoAudit } from "@/lib/demo-data";

export default function ReportPage({ params }: { params: { auditId: string } }) {
  return (
    <main className="section">
      <div className="page-shell">
        <div className="flex flex-wrap justify-between gap-4">
          <div>
            <p className="font-mono text-sm font-semibold text-indigo">Report {params.auditId}</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal">Partial pass with product friction.</h1>
          </div>
          <div className="flex gap-3">
            <Link className="rounded-ui border border-line px-4 py-3 font-semibold" href={`/audits/${params.auditId}/tests`}>
              Tests
            </Link>
            <Link className="rounded-ui bg-emerald px-4 py-3 font-semibold text-white" href="/share/demo-share">
              Share
            </Link>
          </div>
        </div>
        <section className="mt-8 grid gap-4 md:grid-cols-[0.35fr_0.65fr]">
          <div className="rounded-ui border border-line bg-panel p-5">
            <p className="font-mono text-sm text-slate-500">Score</p>
            <p className="mt-2 text-5xl font-semibold">{demoAudit.score}</p>
          </div>
          <div className="rounded-ui border border-line bg-panel p-5">
            <h2 className="text-lg font-semibold">Summary</h2>
            <p className="mt-3 leading-7 text-slate-700">
              The demo flow mostly works on desktop, but mobile signup and repeated submits expose issues that should be fixed before real user traffic.
            </p>
          </div>
        </section>
        <section className="mt-6 grid gap-4">
          {demoAudit.issues.map((issue) => (
            <article key={issue.id} className="rounded-ui border border-line bg-panel p-5">
              <p className="font-mono text-xs font-semibold uppercase text-crimson">{issue.severity} - {issue.category}</p>
              <h2 className="mt-2 text-xl font-semibold">{issue.title}</h2>
              <p className="mt-2 leading-7 text-slate-700">{issue.description}</p>
              <p className="mt-3 text-sm font-semibold">Suggested fix: {issue.suggestedFix}</p>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
