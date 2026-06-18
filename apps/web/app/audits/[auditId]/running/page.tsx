import Link from "next/link";
import { demoAudit } from "@/lib/demo-data";

export default function RunningAuditPage({ params }: { params: { auditId: string } }) {
  return (
    <main className="section">
      <div className="page-shell">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-sm font-semibold text-indigo">Audit {params.auditId}</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal">Personas are testing the goal.</h1>
          </div>
          <Link className="rounded-ui bg-emerald px-4 py-3 font-semibold text-white" href={`/audits/${params.auditId}/report`}>
            Open report
          </Link>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {demoAudit.runs.map((run) => (
            <article key={run.id} className="rounded-ui border border-line bg-panel p-5">
              <p className="font-semibold">{run.persona}</p>
              <p className="mt-1 font-mono text-xs uppercase text-slate-500">{run.status}</p>
              <div className="mt-4 aspect-video rounded-ui border border-line bg-mist" />
              <p className="mt-4 text-sm leading-6 text-slate-700">{run.summary}</p>
            </article>
          ))}
        </div>
        <section className="mt-8 rounded-ui border border-line bg-panel p-5">
          <h2 className="text-lg font-semibold">Step log</h2>
          <ol className="mt-4 grid gap-3 text-sm text-slate-700">
            <li>Normal user opened signup and created an account.</li>
            <li>Mobile user could not reach the primary signup action.</li>
            <li>Chaos user double-clicked Create project and produced duplicate records.</li>
          </ol>
        </section>
      </div>
    </main>
  );
}
