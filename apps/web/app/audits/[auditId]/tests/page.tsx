import { getAuditForPage } from "@/lib/audit-data";

export const dynamic = "force-dynamic";

export default async function TestsPage({ params }: { params: Promise<{ auditId: string }> }) {
  const { auditId } = await params;
  const audit = getAuditForPage(auditId);

  return (
    <main className="section">
      <div className="page-shell">
        <p className="font-mono text-sm font-semibold text-indigo">Generated test</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-normal">Playwright starter check</h1>
        <pre className="mt-8 overflow-x-auto rounded-ui border border-line bg-ink p-5 text-sm text-white">
          <code>{audit.generatedTest}</code>
        </pre>
      </div>
    </main>
  );
}
