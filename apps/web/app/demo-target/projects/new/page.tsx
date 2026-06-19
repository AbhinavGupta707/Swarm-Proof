import Link from "next/link";
import { ArrowRight, ClipboardList, MessageSquareText, Users } from "lucide-react";

export default function NewProjectPage() {
  return (
    <main className="section">
      <div className="page-shell grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
        <aside>
          <p className="font-mono text-sm font-semibold text-indigo">Projects</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-normal">Create a project</h1>
          <p className="mt-4 leading-7 text-slate-700">
            Each launch room keeps milestones, team ownership, and customer feedback in one place.
          </p>
          <div className="mt-6 grid gap-3 text-sm text-slate-700">
            <p className="flex items-center gap-2"><ClipboardList className="h-4 w-4 text-indigo" aria-hidden="true" /> Plan launch tasks</p>
            <p className="flex items-center gap-2"><Users className="h-4 w-4 text-indigo" aria-hidden="true" /> Add collaborators</p>
            <p className="flex items-center gap-2"><MessageSquareText className="h-4 w-4 text-indigo" aria-hidden="true" /> Track feedback</p>
          </div>
        </aside>

        <section className="rounded-ui border border-line bg-panel p-5 shadow-sm">
          <label className="block text-sm font-semibold" htmlFor="projectName">Project name</label>
          <input className="mt-2 min-h-11 w-full rounded-ui border border-line px-3 text-base" id="projectName" defaultValue="Launch review" />
          <label className="mt-5 block text-sm font-semibold" htmlFor="launchDate">Target launch date</label>
          <input className="mt-2 min-h-11 w-full rounded-ui border border-line px-3 text-base" id="launchDate" type="date" defaultValue="2026-06-20" />
          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="inline-flex min-h-11 items-center gap-2 rounded-ui bg-emerald px-5 py-3 font-semibold text-white hover:bg-emerald/90" href="/demo-target/invite">
              Create project
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link className="inline-flex min-h-11 items-center rounded-ui border border-line px-5 py-3 font-semibold hover:bg-mist" href="/demo-target/invite">
              Create project again
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
