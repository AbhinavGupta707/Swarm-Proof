import Link from "next/link";
import { getAuditEvents } from "@swarmproof/db";
import { getAuditForPage } from "@/lib/audit-data";

export const dynamic = "force-dynamic";

export default async function RunningAuditPage({ params }: { params: Promise<{ auditId: string }> }) {
  const { auditId } = await params;
  const audit = getAuditForPage(auditId);
  let eventData: ReturnType<typeof getAuditEvents> | undefined;
  try {
    eventData = audit.id === auditId ? getAuditEvents(auditId) : undefined;
  } catch {
    eventData = undefined;
  }
  const steps = eventData?.steps ?? audit.runs.flatMap((run) => run.steps ?? []);

  return (
    <main className="section">
      <div className="page-shell">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-sm font-semibold text-indigo">Audit {audit.id}</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal">Personas are testing the goal.</h1>
          </div>
          <Link className="rounded-ui bg-emerald px-4 py-3 font-semibold text-white" href={`/audits/${audit.id}/report`}>
            Open report
          </Link>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {audit.runs.map((run) => (
            <article key={run.id} className="rounded-ui border border-line bg-panel p-5">
              <p className="font-semibold">{run.persona}</p>
              <p className="mt-1 font-mono text-xs uppercase text-slate-500">{run.status}</p>
              {run.steps?.at(-1)?.screenshotUrl ? (
                <img className="mt-4 aspect-video rounded-ui border border-line object-cover" src={run.steps.at(-1)?.screenshotUrl} alt="" />
              ) : (
                <div className="mt-4 aspect-video rounded-ui border border-line bg-mist" />
              )}
              <p className="mt-4 text-sm leading-6 text-slate-700">{run.summary}</p>
            </article>
          ))}
        </div>
        <section className="mt-8 rounded-ui border border-line bg-panel p-5">
          <h2 className="text-lg font-semibold">Step log</h2>
          <ol className="mt-4 grid gap-3 text-sm text-slate-700">
            {steps.map((step) => (
              <li key={step.id}>
                <span className="font-semibold">Step {step.stepIndex}:</span> {step.result}
              </li>
            ))}
          </ol>
        </section>
      </div>
    </main>
  );
}
