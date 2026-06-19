import { Suspense } from "react";
import { AuditForm } from "./audit-form";

export default function NewAuditPage() {
  return (
    <main className="section">
      <div className="page-shell grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
        <aside>
          <p className="font-mono text-sm font-semibold text-indigo">New audit</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-normal">Give the swarm a goal.</h1>
          <p className="mt-4 leading-7 text-slate-700">
            Start with the reliable demo target or submit a public URL for safety preflight and an execution-ready report.
          </p>
        </aside>
        <Suspense fallback={<div className="rounded-ui border border-line bg-panel p-5">Loading audit form...</div>}>
          <AuditForm />
        </Suspense>
      </div>
    </main>
  );
}
