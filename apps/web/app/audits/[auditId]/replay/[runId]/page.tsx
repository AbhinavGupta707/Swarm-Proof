import { getAuditForPage } from "@/lib/audit-data";

export const dynamic = "force-dynamic";

export default async function ReplayPage({ params }: { params: Promise<{ auditId: string; runId: string }> }) {
  const { auditId, runId } = await params;
  const audit = getAuditForPage(auditId);
  const run = audit.runs.find((item) => item.id === runId) ?? audit.runs[0];
  const steps = run?.steps?.length ? run.steps : [1, 2, 3].map((step) => ({
    id: `placeholder-${step}`,
    stepIndex: step,
    result: `Placeholder evidence frame for audit ${audit.id}.`,
    screenshotUrl: undefined
  }));

  return (
    <main className="section">
      <div className="page-shell">
        <p className="font-mono text-sm font-semibold text-indigo">Replay {run?.id ?? runId}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-normal">Screenshot timeline</h1>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {steps.map((step) => (
            <article key={step.id} className="rounded-ui border border-line bg-panel p-4">
              {step.screenshotUrl ? (
                <img className="aspect-video rounded-ui border border-line object-cover" src={step.screenshotUrl} alt="" />
              ) : (
                <div className="aspect-video rounded-ui border border-line bg-mist" />
              )}
              <p className="mt-3 text-sm font-semibold">Step {step.stepIndex}</p>
              <p className="mt-1 text-sm text-slate-700">{step.result}</p>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
