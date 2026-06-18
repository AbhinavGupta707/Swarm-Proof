import { demoAudit } from "@/lib/demo-data";

export default function SharePage({ params }: { params: { shareToken: string } }) {
  return (
    <main className="section">
      <div className="page-shell">
        <p className="font-mono text-sm font-semibold text-indigo">Shared report {params.shareToken}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-normal">SwarmProof demo audit</h1>
        <p className="mt-4 max-w-3xl leading-7 text-slate-700">
          Public read-only share view scaffold. It will be backed by share-token APIs in the backend workstream.
        </p>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {demoAudit.issues.map((issue) => (
            <article key={issue.id} className="rounded-ui border border-line bg-panel p-5">
              <p className="font-mono text-xs font-semibold text-crimson">{issue.severity}</p>
              <h2 className="mt-2 text-lg font-semibold">{issue.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-700">{issue.description}</p>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
