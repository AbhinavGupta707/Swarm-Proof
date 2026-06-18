import Link from "next/link";
import { Activity, Bug, FileCode2 } from "lucide-react";
import { demoAudit } from "@/lib/demo-data";

const outputs = [
  { icon: Activity, title: "Live persona runs", body: "Normal, mobile, and chaos users show step-by-step progress." },
  { icon: Bug, title: "Evidence-backed issues", body: "Screenshots, friction notes, and detected blockers stay attached to the report." },
  { icon: FileCode2, title: "Generated tests", body: "Failed paths turn into starter Playwright checks or PM-ready bug reports." }
];

export default function HomePage() {
  return (
    <main>
      <section className="section border-b border-line bg-panel">
        <div className="page-shell grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div className="max-w-3xl">
            <p className="mb-4 font-mono text-sm font-semibold text-indigo">Mind the Product hackathon build</p>
            <h1 className="text-4xl font-semibold tracking-normal text-ink sm:text-6xl">
              AI users test your product before real users suffer.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-700">
              Paste a URL, describe the user goal, and watch AI browser personas find confusing copy,
              hidden CTAs, broken flows, and testable regressions.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link className="rounded-ui bg-emerald px-5 py-3 font-semibold text-white transition hover:opacity-90" href="/audits/new?demo=1">
                Run demo audit
              </Link>
              <Link className="rounded-ui border border-line px-5 py-3 font-semibold transition hover:bg-mist" href="/audits/new">
                Test my URL
              </Link>
            </div>
          </div>
          <div className="rounded-ui border border-line bg-mist p-4">
            <div className="rounded-ui border border-line bg-panel p-4">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <span className="font-mono text-sm font-semibold">Demo audit</span>
                <span className="rounded-ui bg-emerald/10 px-2 py-1 text-xs font-semibold text-emerald">Live scaffold</span>
              </div>
              <div className="mt-4 grid gap-3">
                {demoAudit.runs.map((run) => (
                  <div key={run.id} className="rounded-ui border border-line p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold">{run.persona}</p>
                      <p className="text-sm text-slate-600">{run.status}</p>
                    </div>
                    <p className="mt-2 text-sm text-slate-700">{run.summary}</p>
                  </div>
                ))}
              </div>
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
    </main>
  );
}
