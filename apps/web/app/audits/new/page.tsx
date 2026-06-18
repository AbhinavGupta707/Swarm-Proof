import Link from "next/link";
import { ShieldCheck } from "lucide-react";

export default function NewAuditPage() {
  return (
    <main className="section">
      <div className="page-shell grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
        <aside>
          <p className="font-mono text-sm font-semibold text-indigo">New audit</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-normal">Give the swarm a goal.</h1>
          <p className="mt-4 leading-7 text-slate-700">
            This scaffold starts with deterministic demo mode. Backend and worker sessions will replace this with real audit creation and polling.
          </p>
        </aside>
        <form className="rounded-ui border border-line bg-panel p-5">
          <label className="block text-sm font-semibold" htmlFor="targetUrl">
            Product URL
          </label>
          <input
            className="mt-2 min-h-11 w-full rounded-ui border border-line px-3"
            id="targetUrl"
            name="targetUrl"
            placeholder="https://your-product.com"
            defaultValue="/demo-target"
          />
          <label className="mt-5 block text-sm font-semibold" htmlFor="goal">
            User goal
          </label>
          <textarea
            className="mt-2 min-h-28 w-full rounded-ui border border-line px-3 py-2"
            id="goal"
            name="goal"
            defaultValue="Sign up, create a project, invite a teammate."
          />
          <fieldset className="mt-5 grid gap-3 sm:grid-cols-2">
            <legend className="mb-2 text-sm font-semibold">Personas</legend>
            {["normal", "mobile", "chaos", "accessibility-lite"].map((mode) => (
              <label key={mode} className="flex min-h-11 items-center gap-3 rounded-ui border border-line px-3">
                <input defaultChecked={mode !== "accessibility-lite"} name="modes" type="checkbox" value={mode} />
                <span className="capitalize">{mode}</span>
              </label>
            ))}
          </fieldset>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="inline-flex items-center gap-2 rounded-ui bg-emerald px-5 py-3 font-semibold text-white" href="/audits/demo/running">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              Use built-in demo app
            </Link>
            <button className="rounded-ui border border-line px-5 py-3 font-semibold" type="button">
              Create audit
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
