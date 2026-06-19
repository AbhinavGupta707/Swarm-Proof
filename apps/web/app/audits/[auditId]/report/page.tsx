import Link from "next/link";
import { createShare } from "@swarmproof/db";
import { getAuditForPage } from "@/lib/audit-data";

export const dynamic = "force-dynamic";

export default async function ReportPage({ params }: { params: Promise<{ auditId: string }> }) {
  const { auditId } = await params;
  const audit = getAuditForPage(auditId);
  let share = { shareToken: "demo-share" };
  try {
    share = audit.id === auditId ? createShare(audit.id, process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000") : share;
  } catch {
    share = { shareToken: audit.shareToken ?? "demo-share" };
  }
  const report = audit.report;

  return (
    <main className="section">
      <div className="page-shell">
        <div className="flex flex-wrap justify-between gap-4">
          <div>
            <p className="font-mono text-sm font-semibold text-indigo">Report {audit.id}</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal">{report?.outcome === "fail" ? "Needs fixes before real traffic." : "Partial pass with product friction."}</h1>
          </div>
          <div className="flex gap-3">
            <Link className="rounded-ui border border-line px-4 py-3 font-semibold" href={`/audits/${audit.id}/tests`}>
              Tests
            </Link>
            <Link className="rounded-ui bg-emerald px-4 py-3 font-semibold text-white" href={`/share/${share.shareToken}`}>
              Share
            </Link>
          </div>
        </div>
        <section className="mt-8 grid gap-4 md:grid-cols-[0.35fr_0.65fr]">
          <div className="rounded-ui border border-line bg-panel p-5">
            <p className="font-mono text-sm text-slate-500">Score</p>
            <p className="mt-2 text-5xl font-semibold">{audit.score}</p>
          </div>
          <div className="rounded-ui border border-line bg-panel p-5">
            <h2 className="text-lg font-semibold">Summary</h2>
            <p className="mt-3 leading-7 text-slate-700">
              {report?.summary ?? "The demo flow mostly works on desktop, but mobile signup and repeated submits expose issues that should be fixed before real user traffic."}
            </p>
          </div>
        </section>
        <section className="mt-6 grid gap-4">
          {audit.issues.map((issue) => (
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
