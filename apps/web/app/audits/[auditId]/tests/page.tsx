import Link from "next/link";
import { Bug, ClipboardCheck, FileCode2, Share2 } from "lucide-react";
import { demoAudit } from "@/lib/demo-data";

export default async function TestsPage({ params }: { params: Promise<{ auditId: string }> }) {
  const { auditId } = await params;

  return (
    <main className="section">
      <div className="page-shell">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-sm font-semibold text-indigo">Generated test</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-normal">Turn the failed path into a regression check.</h1>
            <p className="mt-3 max-w-3xl leading-7 text-slate-700">
              SwarmProof converts the observed demo failure into a starter Playwright test plus a PM-readable bug export.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="inline-flex min-h-11 items-center rounded-ui border border-line px-4 py-3 font-semibold hover:bg-mist" href={`/audits/${auditId}/report`}>
              Back to report
            </Link>
            <Link className="inline-flex min-h-11 items-center gap-2 rounded-ui bg-emerald px-4 py-3 font-semibold text-white hover:bg-emerald/90" href="/share/demo-share">
              <Share2 className="h-4 w-4" aria-hidden="true" />
              Share
            </Link>
          </div>
        </div>

        <section className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-ui border border-line bg-ink p-5 text-white shadow-sm">
            <div className="flex items-center gap-2">
              <FileCode2 className="h-5 w-5 text-emerald" aria-hidden="true" />
              <h2 className="text-lg font-semibold">Playwright starter check</h2>
            </div>
            <pre className="mt-5 max-h-[34rem] overflow-x-auto text-sm leading-6 text-slate-100">
              <code>{demoAudit.generatedTest}</code>
            </pre>
          </div>

          <aside className="grid content-start gap-4">
            <section className="rounded-ui border border-line bg-panel p-5">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <ClipboardCheck className="h-5 w-5 text-indigo" aria-hidden="true" />
                Acceptance criteria covered
              </h2>
              <ul className="mt-4 grid gap-3 text-sm leading-6 text-slate-700">
                <li>Open the public demo target.</li>
                <li>Create an account using visible labels.</li>
                <li>Create a project before inviting a teammate.</li>
                <li>Assert the team screen appears after project creation.</li>
              </ul>
            </section>
            <section className="rounded-ui border border-line bg-panel p-5">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <Bug className="h-5 w-5 text-crimson" aria-hidden="true" />
                Bug report export
              </h2>
              <pre className="mt-4 whitespace-pre-wrap rounded-ui bg-mist p-4 text-sm leading-6 text-slate-700">
                {demoAudit.bugReport}
              </pre>
            </section>
          </aside>
        </section>
      </div>
    </main>
  );
}
