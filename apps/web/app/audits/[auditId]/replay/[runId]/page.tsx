export default function ReplayPage({ params }: { params: { auditId: string; runId: string } }) {
  return (
    <main className="section">
      <div className="page-shell">
        <p className="font-mono text-sm font-semibold text-indigo">Replay {params.runId}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-normal">Screenshot timeline</h1>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((step) => (
            <article key={step} className="rounded-ui border border-line bg-panel p-4">
              <div className="aspect-video rounded-ui border border-line bg-mist" />
              <p className="mt-3 text-sm font-semibold">Step {step}</p>
              <p className="mt-1 text-sm text-slate-700">Placeholder evidence frame for audit {params.auditId}.</p>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
