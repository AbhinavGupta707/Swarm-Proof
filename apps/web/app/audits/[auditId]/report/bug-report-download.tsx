"use client";

import { Download } from "lucide-react";

export function BugReportDownloadLink({
  href,
  targetKind,
  issueCount,
  score,
  outcome
}: {
  href: string;
  targetKind: string;
  issueCount: number;
  score: number;
  outcome: string;
}) {
  return (
    <a
      className="inline-flex min-h-11 items-center justify-between gap-3 rounded-ui border border-line px-4 py-3 font-semibold hover:bg-mist"
      href={href}
      download="swarmproof-bug-report.md"
      onClick={() => {
        window.pendo?.track?.("bug_report_downloaded", {
          target_kind: targetKind,
          issue_count: issueCount,
          score,
          file_format: "markdown",
          outcome
        });
      }}
    >
      PM-ready bug report
      <Download className="h-4 w-4 text-indigo" aria-hidden="true" />
    </a>
  );
}
