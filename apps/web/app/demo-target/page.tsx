import Link from "next/link";
import { ArrowRight, CalendarDays, CheckCircle2, Users } from "lucide-react";

export default function DemoTargetPage() {
  return (
    <main className="section bg-panel">
      <div className="page-shell grid gap-8 lg:grid-cols-2 lg:items-center">
        <div>
          <p className="font-mono text-sm font-semibold text-indigo">Acme Launchpad</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-normal">Ship small product experiments with your team.</h1>
          <p className="mt-4 max-w-xl leading-7 text-slate-700">
            Plan launches, assign collaborators, and keep customer feedback close while your team moves fast.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link className="inline-flex min-h-11 items-center gap-2 rounded-ui bg-emerald px-5 py-3 font-semibold text-white hover:bg-emerald/90" href="/demo-target/signup">
              Get started
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <a className="inline-flex min-h-11 items-center rounded-ui border border-line px-5 py-3 font-semibold hover:bg-mist" href="#preview">
              View workspace
            </a>
          </div>
        </div>

        <section id="preview" className="rounded-ui border border-line bg-mist p-5">
          <div className="flex items-center justify-between gap-3 border-b border-line pb-4">
            <div>
              <p className="font-semibold">Launch review</p>
              <p className="mt-1 text-sm text-slate-600">Workspace health</p>
            </div>
            <span className="rounded-ui bg-emerald/10 px-2 py-1 font-mono text-xs font-semibold text-emerald">ready</span>
          </div>
          <div className="mt-5 grid gap-4">
            <div className="flex items-center gap-3">
              <CalendarDays className="h-5 w-5 text-indigo" aria-hidden="true" />
              <div>
                <p className="font-semibold">Launch checklist</p>
                <p className="text-sm text-slate-600">8 tasks due this week</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Users className="h-5 w-5 text-indigo" aria-hidden="true" />
              <div>
                <p className="font-semibold">Team workspace</p>
                <p className="text-sm text-slate-600">Invite collaborators before launch</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald" aria-hidden="true" />
              <div>
                <p className="font-semibold">Feedback loop</p>
                <p className="text-sm text-slate-600">Customer notes connected to roadmap</p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
