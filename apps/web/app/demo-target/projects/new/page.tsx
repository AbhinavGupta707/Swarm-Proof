import Link from "next/link";

export default function NewProjectPage() {
  return (
    <main className="section">
      <div className="page-shell max-w-2xl">
        <p className="font-mono text-sm font-semibold text-indigo">Projects</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-normal">Create a project</h1>
        <div className="mt-6 rounded-ui border border-line bg-panel p-5">
          <label className="block text-sm font-semibold" htmlFor="projectName">Project name</label>
          <input className="mt-2 min-h-11 w-full rounded-ui border border-line px-3" id="projectName" defaultValue="Launch review" />
          <p className="mt-4 text-sm text-slate-700">
            Intentional chaos bug: repeated submits are not disabled and can create duplicates.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="rounded-ui bg-emerald px-5 py-3 font-semibold text-white" href="/demo-target/invite">
              Create project
            </Link>
            <Link className="rounded-ui border border-line px-5 py-3 font-semibold" href="/demo-target/invite">
              Create project again
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
