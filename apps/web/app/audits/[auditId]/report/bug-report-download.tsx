"use client";

import { Download } from "lucide-react";

export function BugReportDownload({
  bugReport,
  auditId,
  issueCount,
  score,
}: {
  bugReport: string;
  auditId: string;
  issueCount: number;
  score: number;
}) {
  return (
    <a
      className="inline-flex min-h-11 items-center justify-between gap-3 rounded-ui border border-line px-4 py-3 font-semibold hover:bg-mist"
      href={`data:text/markdown;charset=utf-8,${encodeURIComponent(bugReport)}`}
      download="swarmproof-bug-report.md"
      onClick={() => {
        try {
          const w = window as unknown as { pendo?: { track?: (name: string, props: Record<string, unknown>) => void } };
          w.pendo?.track?.("bug_report_exported", {
            audit_id: auditId,
            issue_count: issueCount,
            score,
            file_format: "markdown",
          });
        } catch { /* tracking must not break application flow */ }
      }}
    >
      PM-ready bug report
      <Download className="h-4 w-4 text-indigo" aria-hidden="true" />
    </a>
  );
}
