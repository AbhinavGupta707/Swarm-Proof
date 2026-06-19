import Link from "next/link";
import { Activity, Bug, CheckCircle2, FileCode2, Gauge, Share2, ShieldCheck, TestTube2 } from "lucide-react";
import { demoAudit } from "@/lib/demo-data";

const outputs = [
  { icon: Activity, title: "Live persona runs", body: "Normal, mobile, and chaos users show step-by-step progress." },
  { icon: Bug, title: "Evidence-backed issues", body: "Screenshots, friction notes, and detected blockers stay attached to the report." },
  { icon: FileCode2, title: "Generated tests", body: "Failed paths turn into starter Playwright checks or PM-ready bug reports." }
];

export default function HomePage() {
  return (
    <main>
      <section className="section surface-grid border-b border-line bg-panel">
        <div className="page-shell grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div className="max-w-3xl">
            <p className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-ui border border-line bg-panel px-3 font-mono text-sm font-semibold text-indigo">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              Mind the Product hackathon build
            </p>
            <h1 className="text-4xl font-semibold tracking-normal text-ink sm:text-6xl">
              AI users test your product before real users suffer.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-700">
              Paste a URL, describe the user goal, and watch AI browser personas find confusing copy,
              hidden CTAs, broken flows, and testable regressions.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link className="inline-flex min-h-11 items-center gap-2 rounded-ui bg-emerald px-5 py-3 font-semibold text-white transition hover:bg-emerald/90" href="/audits/new?demo=1">
                <Activity className="h-4 w-4" aria-hidden="true" />
                Run demo audit
              </Link>
              <Link className="inline-flex min-h-11 items-center rounded-ui border border-line bg-panel px-5 py-3 font-semibold transition hover:bg-mist" href="/audits/new">
                Test my URL
              </Link>
            </div>
            <div className="mt-8 grid max-w-2xl gap-3 text-sm sm:grid-cols-3">
              {demoAudit.metrics.slice(0, 3).map((metric) => (
                <div key={metric.label} className="border-l-2 border-line pl-3">
                  <p className="font-mono text-xl font-semibold text-ink">{metric.value}</p>
                  <p className="mt-1 text-slate-600">{metric.label}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-ui border border-line bg-panel p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-line pb-4">
              <div>
                <p className="font-mono text-sm font-semibold">Demo audit: {demoAudit.result}</p>
                <p className="mt-1 text-sm text-slate-600">{demoAudit.goal}</p>
              </div>
              <div className="grid h-14 w-14 place-items-center rounded-ui bg-emerald/10">
                <Gauge className="h-6 w-6 text-emerald" aria-hidden="true" />
              </div>
            </div>
            <div className="mt-5 grid gap-4">
              {demoAudit.runs.map((run) => (
                <div key={run.id} className="grid gap-3 border-b border-line pb-4 last:border-b-0 last:pb-0 sm:grid-cols-[9rem_1fr_auto] sm:items-start">
                  <div>
                    <p className="font-semibold">{run.persona}</p>
                    <p className="mt-1 font-mono text-xs uppercase text-slate-500">{run.mode}</p>
                  </div>
                  <p className="text-sm leading-6 text-slate-700">{run.summary}</p>
                  <span className="w-fit rounded-ui bg-amber/10 px-2 py-1 font-mono text-xs font-semibold text-amber">
                    {run.status}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-5 grid grid-cols-3 gap-2 border-t border-line pt-4 text-xs text-slate-600">
              <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-emerald" aria-hidden="true" /> preflight</span>
              <span className="inline-flex items-center gap-1"><TestTube2 className="h-3.5 w-3.5 text-indigo" aria-hidden="true" /> test</span>
              <span className="inline-flex items-center gap-1"><Share2 className="h-3.5 w-3.5 text-crimson" aria-hidden="true" /> share</span>
            </div>
          </div>
        </div>
      </section>
      <section className="section">
        <div className="page-shell grid gap-4 md:grid-cols-3">
          {outputs.map((item) => (
            <article key={item.title} className="rounded-ui border border-line bg-panel p-5">
              <item.icon className="h-5 w-5 text-indigo" aria-hidden="true" />
              <h2 className="mt-4 text-lg font-semibold">{item.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-700">{item.body}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="border-t border-line bg-panel py-10">
        <div className="page-shell flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">Reliable public demo path</h2>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              Landing to demo audit to live run to report, generated test, share page, and Novus proof.
            </p>
          </div>
          <Link className="inline-flex min-h-11 items-center rounded-ui border border-line px-4 py-3 font-semibold hover:bg-mist" href="/audits/demo/report">
            Open demo report
          </Link>
        </div>
      </section>
    </main>
  );
}
