import Link from "next/link";
import { Bot, Gauge, Globe2, MonitorSmartphone, RotateCcw, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { demoAudit } from "@/lib/demo-data";

const modes = [
  { id: "normal", label: "Normal", icon: Bot, detail: "Reasonable first-time user" },
  { id: "mobile", label: "Mobile", icon: MonitorSmartphone, detail: "390px viewport, touch targets" },
  { id: "chaos", label: "Chaos", icon: RotateCcw, detail: "Double-clicks, invalid input" },
  { id: "accessibility-lite", label: "A11y lite", icon: ShieldCheck, detail: "Labels and focus checks" }
];

export default function NewAuditPage() {
  return (
    <main className="section surface-grid">
      <div className="page-shell grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
        <aside>
          <p className="font-mono text-sm font-semibold text-indigo">New audit</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-normal">Give the swarm a goal.</h1>
          <p className="mt-4 leading-7 text-slate-700">
            Use the built-in target for the judge-safe path, or stage a public URL audit with the same persona plan.
          </p>
          <div className="mt-6 grid gap-3">
            {demoAudit.metrics.map((metric) => (
              <div key={metric.label} className="flex items-center justify-between gap-4 border-b border-line pb-3">
                <div>
                  <p className="font-semibold">{metric.label}</p>
                  <p className="mt-1 text-sm text-slate-600">{metric.detail}</p>
                </div>
                <p className="font-mono text-2xl font-semibold">{metric.value}</p>
              </div>
            ))}
          </div>
        </aside>
        <form className="rounded-ui border border-line bg-panel p-5 shadow-sm">
          <div className="grid gap-5">
            <div>
              <label className="flex items-center gap-2 text-sm font-semibold" htmlFor="targetUrl">
                <Globe2 className="h-4 w-4 text-indigo" aria-hidden="true" />
                Product URL
              </label>
              <input
                className="mt-2 min-h-11 w-full rounded-ui border border-line px-3 text-base"
                id="targetUrl"
                name="targetUrl"
                placeholder="https://your-product.com"
                defaultValue={demoAudit.targetUrl}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold" htmlFor="goal">
                User goal
              </label>
              <textarea
                className="mt-2 min-h-32 w-full rounded-ui border border-line px-3 py-2 text-base leading-7"
                id="goal"
                name="goal"
                defaultValue={demoAudit.goal}
              />
            </div>
            <fieldset>
              <legend className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <SlidersHorizontal className="h-4 w-4 text-indigo" aria-hidden="true" />
                Personas and checks
              </legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {modes.map((mode) => (
                  <label key={mode.id} className="flex min-h-16 cursor-pointer items-start gap-3 rounded-ui border border-line px-3 py-3 hover:bg-mist">
                    <input defaultChecked={mode.id !== "accessibility-lite"} className="mt-1" name="modes" type="checkbox" value={mode.id} />
                    <mode.icon className="mt-0.5 h-4 w-4 text-indigo" aria-hidden="true" />
                    <span>
                      <span className="block font-semibold">{mode.label}</span>
                      <span className="mt-1 block text-sm text-slate-600">{mode.detail}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div>
              <label className="flex items-center justify-between gap-4 text-sm font-semibold" htmlFor="maxSteps">
                <span className="inline-flex items-center gap-2">
                  <Gauge className="h-4 w-4 text-indigo" aria-hidden="true" />
                  Max steps
                </span>
                <span className="font-mono text-slate-600">15</span>
              </label>
              <input className="mt-3 w-full accent-emerald" defaultValue={15} id="maxSteps" max={25} min={6} name="maxSteps" type="range" />
            </div>
            <div className="flex flex-wrap gap-3 border-t border-line pt-5">
              <Link className="inline-flex min-h-11 items-center gap-2 rounded-ui bg-emerald px-5 py-3 font-semibold text-white hover:bg-emerald/90" href="/audits/demo/running">
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                Use built-in demo app
              </Link>
              <Link className="inline-flex min-h-11 items-center rounded-ui border border-line px-5 py-3 font-semibold hover:bg-mist" href="/audits/demo/running">
                Create audit
              </Link>
            </div>
            <p className="text-sm leading-6 text-slate-600">
              External URLs are treated as public/auth-limited checks in this MVP. The demo app is the reliable end-to-end path.
            </p>
          </div>
        </form>
      </div>
    </main>
  );
}
