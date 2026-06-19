import { getSharedAuditForPage } from "@/lib/audit-data";

export const dynamic = "force-dynamic";

export default async function SharePage({ params }: { params: Promise<{ shareToken: string }> }) {
  const { shareToken } = await params;
  const audit = getSharedAuditForPage(shareToken);

  return (
    <main className="section">
      <div className="page-shell">
        <p className="font-mono text-sm font-semibold text-indigo">Shared report {shareToken}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-normal">SwarmProof demo audit</h1>
        <p className="mt-4 max-w-3xl leading-7 text-slate-700">
          Public read-only report for {audit.goal}
        </p>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {audit.issues.map((issue) => (
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
