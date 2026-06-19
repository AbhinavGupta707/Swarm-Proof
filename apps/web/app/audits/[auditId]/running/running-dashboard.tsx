"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, CircleStop, Clock3, Eye, Loader2, Monitor, RefreshCw, Smartphone, Zap } from "lucide-react";
import { Events, trackEvent, type EventName } from "@swarmproof/events";
import type {
  ArtifactSummary,
  AuditEventSummary,
  AuditIssueSummary,
  AuditJobSummary,
  AuditPreflightSummary,
  AuditProvider,
  AuditRunSummary,
  AuditStatus,
  AuditSummary,
  BrowserStepSummary,
  RunStatus
} from "@swarmproof/types";
import { auditMetrics, auditPreflightLabel, auditSuccessRate, auditTimeline, auditTimeToValue } from "@/lib/audit-presenters";

type EventPayload = {
  events: AuditEventSummary[];
  steps: BrowserStepSummary[];
  runs: AuditRunSummary[];
  status: AuditStatus;
  issueCount: number;
  issues?: AuditIssueSummary[];
  artifacts?: ArtifactSummary[];
  jobs?: AuditJobSummary[];
  provider?: AuditProvider;
  maxSteps?: number;
  preflight?: AuditPreflightSummary;
  completedAt?: string;
  updatedAt?: string;
};

type ApiResponse<T> = {
  ok: boolean;
  data?: T;
  error?: { message: string };
};

const runStatusStyles: Record<RunStatus, string> = {
  BLOCKED: "bg-amber/10 text-amber",
  FAILED: "bg-crimson/10 text-crimson",
  SUCCEEDED: "bg-emerald/10 text-emerald",
  RUNNING: "bg-indigo/10 text-indigo",
  PENDING: "bg-slate-100 text-slate-600"
};

const auditStatusStyles: Record<AuditStatus, string> = {
  CREATED: "bg-slate-100 text-slate-600",
  PREFLIGHT: "bg-indigo/10 text-indigo",
  RUNNING: "bg-indigo/10 text-indigo",
  COMPLETED: "bg-emerald/10 text-emerald",
  FAILED: "bg-crimson/10 text-crimson",
  CANCELLED: "bg-slate-100 text-slate-600"
};

const stepIcons = {
  passed: CheckCircle2,
  warning: AlertTriangle,
  failed: AlertTriangle
};

const mirroredEventIds = new Set<string>();

export function RunningDashboard({ initialAudit, initialEventCount = 0 }: { initialAudit: AuditSummary; initialEventCount?: number }) {
  const [audit, setAudit] = useState(initialAudit);
  const [eventCount, setEventCount] = useState(initialEventCount || initialAudit.eventCount || 0);
  const [pollError, setPollError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(initialAudit.updatedAt ?? "");

  const hasActiveRun = audit.status === "RUNNING" || audit.runs.some((run) => run.status === "RUNNING" || run.status === "PENDING");
  const timeline = useMemo(() => auditTimeline(audit), [audit]);
  const metrics = useMemo(() => auditMetrics({ ...audit, eventCount }), [audit, eventCount]);
  const modeLabel = auditPreflightLabel(audit);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const response = await fetch(`/api/audits/${audit.id}/events`, { cache: "no-store" });
        const payload = await response.json() as ApiResponse<EventPayload>;
        if (!payload.ok || !payload.data) {
          throw new Error(payload.error?.message ?? "Could not refresh audit events.");
        }

        if (cancelled) return;
        const data = payload.data;
        for (const event of data.events) {
          if (mirroredEventIds.has(event.id) || !isTrackableEventName(event.name)) {
            continue;
          }

          mirroredEventIds.add(event.id);
          trackEvent(event.name, {
            ...event.props,
            target_kind: data.preflight?.isDemoTarget ? "demo" : "public"
          });
        }

        setAudit((current) => ({
          ...current,
          status: data.status,
          runs: data.runs,
          issues: data.issues ?? current.issues,
          artifacts: data.artifacts ?? current.artifacts,
          jobs: data.jobs ?? current.jobs,
          provider: data.provider ?? current.provider,
          maxSteps: data.maxSteps ?? current.maxSteps,
          preflight: data.preflight ?? current.preflight,
          completedAt: data.completedAt ?? current.completedAt,
          updatedAt: data.updatedAt ?? current.updatedAt
        }));
        setEventCount(data.events.length);
        setLastUpdated(data.updatedAt ?? "");
        setPollError("");
      } catch (error) {
        if (!cancelled) {
          setPollError(error instanceof Error ? error.message : "Could not refresh audit events.");
        }
      }
    }

    void poll();
    if (!hasActiveRun) return () => {
      cancelled = true;
    };

    const interval = window.setInterval(() => {
      void poll();
    }, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [audit.id, hasActiveRun]);

  return (
    <main className="section surface-grid">
      <div className="page-shell">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-sm font-semibold text-indigo">Audit {audit.id}</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-normal">Personas are testing the goal.</h1>
            <p className="mt-3 max-w-3xl leading-7 text-slate-700">{audit.goal}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className={`rounded-ui px-2 py-1 font-mono text-xs font-semibold ${auditStatusStyles[audit.status]}`}>{audit.status}</span>
              <span className="rounded-ui bg-panel px-2 py-1 font-mono text-xs font-semibold text-slate-600">{modeLabel}</span>
              {lastUpdated ? <span className="rounded-ui bg-panel px-2 py-1 font-mono text-xs font-semibold text-slate-600">Updated {formatTime(lastUpdated)}</span> : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <button className="inline-flex min-h-11 items-center gap-2 rounded-ui border border-line bg-panel px-4 py-3 font-semibold opacity-60" type="button" disabled>
              <CircleStop className="h-4 w-4" aria-hidden="true" />
              Stop
            </button>
            <Link className="inline-flex min-h-11 items-center rounded-ui bg-emerald px-4 py-3 font-semibold text-white hover:bg-emerald/90" href={`/audits/${audit.id}/report`}>
              Open report
            </Link>
          </div>
        </div>

        <section className="mt-8 grid gap-4 md:grid-cols-4">
          {metrics.map((metric) => (
            <div key={metric.label} className="rounded-ui border border-line bg-panel p-4">
              <p className="font-mono text-2xl font-semibold">{metric.value}</p>
              <p className="mt-1 font-semibold">{metric.label}</p>
              <p className="mt-1 text-sm text-slate-600">{metric.detail}</p>
            </div>
          ))}
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-3">
          {(audit.runs.length ? audit.runs : placeholderRuns()).map((run) => {
            const latestStep = run.steps?.at(-1);
            return (
              <article key={run.id} className="rounded-ui border border-line bg-panel p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{run.persona}</p>
                    <p className="mt-1 font-mono text-xs uppercase text-slate-500">{run.mode}</p>
                  </div>
                  <span className={`rounded-ui px-2 py-1 font-mono text-xs font-semibold ${runStatusStyles[run.status]}`}>
                    {run.status}
                  </span>
                </div>
                <div className="mt-4 aspect-video rounded-ui border border-line bg-mist p-3">
                  {latestStep?.screenshotUrl ? (
                    <img className="h-full w-full rounded-ui object-cover" src={latestStep.screenshotUrl} alt={`Latest evidence for ${run.persona}`} />
                  ) : (
                    <EvidencePlaceholder mode={run.mode} status={run.status} />
                  )}
                </div>
                <p className="mt-4 min-h-12 text-sm leading-6 text-slate-700">{run.summary || summaryForRun(run.status)}</p>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Link className="inline-flex min-h-11 items-center rounded-ui border border-line px-3 py-2 text-sm font-semibold hover:bg-mist" href={`/audits/${audit.id}/replay/${run.id}`}>
                    View replay
                  </Link>
                  <span className="font-mono text-xs text-slate-500">{run.steps?.length ?? 0} steps</span>
                </div>
              </article>
            );
          })}
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-ui border border-line bg-panel p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Step log</h2>
              <span className={`inline-flex items-center gap-2 font-mono text-xs font-semibold ${hasActiveRun ? "text-indigo" : "text-emerald"}`}>
                {hasActiveRun ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
                {hasActiveRun ? "polling live events" : "run settled"}
              </span>
            </div>
            {pollError ? <p className="mt-4 rounded-ui border border-amber/30 bg-amber/10 p-3 text-sm font-semibold text-amber">{pollError}</p> : null}
            {timeline.length ? (
              <ol className="mt-5 grid gap-4">
                {timeline.map((step) => {
                  const Icon = stepIcons[step.status];
                  return (
                    <li key={step.id} className="grid gap-3 border-b border-line pb-4 last:border-b-0 last:pb-0 sm:grid-cols-[4rem_1fr]">
                      <span className="font-mono text-sm text-slate-500">{step.time}</span>
                      <div>
                        <p className="flex items-center gap-2 font-semibold">
                          <Icon className={step.status === "passed" ? "h-4 w-4 text-emerald" : step.status === "warning" ? "h-4 w-4 text-amber" : "h-4 w-4 text-crimson"} aria-hidden="true" />
                          {step.label}
                        </p>
                        <p className="mt-1 text-sm leading-6 text-slate-700">{step.result}</p>
                        <p className="mt-2 font-mono text-xs text-slate-500">{step.url} · {step.evidence}</p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <div className="mt-5 rounded-ui border border-dashed border-line bg-mist p-5 text-sm font-semibold text-slate-600">
                Waiting for the first worker callback.
              </div>
            )}
          </div>
          <aside className="rounded-ui border border-line bg-ink p-5 text-white shadow-sm">
            <p className="flex items-center gap-2 font-mono text-sm font-semibold text-emerald">
              <Zap className="h-4 w-4" aria-hidden="true" />
              Live summary
            </p>
            <h2 className="mt-3 text-2xl font-semibold">{audit.issues.length} issues found while the goal was in progress.</h2>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              {hasActiveRun ? "The report will update as callbacks arrive from the active run." : "The report, generated test, and share link are ready to inspect for this run."}
            </p>
            <div className="mt-5 grid gap-3 text-sm">
              <p className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-emerald" aria-hidden="true" /> {auditTimeToValue(audit)}</p>
              <p className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber" aria-hidden="true" /> {auditSuccessRate(audit)}</p>
              <p className="flex items-center gap-2"><RefreshCw className="h-4 w-4 text-indigo" aria-hidden="true" /> {eventCount} safe events</p>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}

function isTrackableEventName(name: string): name is EventName {
  return (Object.values(Events) as string[]).includes(name);
}

function EvidencePlaceholder({ mode, status }: { mode: AuditRunSummary["mode"]; status: RunStatus }) {
  return (
    <div className="flex h-full flex-col justify-between">
      <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1">
          {mode === "mobile" ? <Smartphone className="h-3.5 w-3.5" aria-hidden="true" /> : <Monitor className="h-3.5 w-3.5" aria-hidden="true" />}
          {mode === "mobile" ? "390 x 844" : "desktop viewport"}
        </span>
        <Eye className="h-3.5 w-3.5" aria-hidden="true" />
      </div>
      <div className="grid gap-2">
        <div className="h-3 w-3/4 rounded bg-slate-300" />
        <div className="h-3 w-1/2 rounded bg-slate-200" />
        <div className={`h-8 w-28 rounded-ui ${status === "FAILED" ? "bg-crimson/20" : status === "RUNNING" ? "bg-indigo/20" : "bg-emerald/20"}`} />
      </div>
    </div>
  );
}

function placeholderRuns(): AuditRunSummary[] {
  const startedAt = new Date().toISOString();
  return [
    { id: "pending-normal", persona: "Normal user", mode: "normal", status: "PENDING", summary: "", viewport: "1440x900", startedAt, steps: [] },
    { id: "pending-mobile", persona: "Mobile user", mode: "mobile", status: "PENDING", summary: "", viewport: "390x844", startedAt, steps: [] },
    { id: "pending-chaos", persona: "Chaos user", mode: "chaos", status: "PENDING", summary: "", viewport: "1366x768", startedAt, steps: [] }
  ];
}

function summaryForRun(status: RunStatus) {
  if (status === "PENDING") return "Waiting for worker dispatch.";
  if (status === "RUNNING") return "Worker is collecting browser evidence.";
  if (status === "SUCCEEDED") return "Persona completed without a blocker.";
  if (status === "FAILED") return "Persona found a failure.";
  return "Persona was blocked.";
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
