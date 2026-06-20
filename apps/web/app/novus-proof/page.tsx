import { BarChart3, CheckCircle2, LockKeyhole, RadioTower } from "lucide-react";
import { demoAudit } from "@/lib/demo-data";

export default function NovusProofPage() {
  const eventCount = demoAudit.novusEvents.reduce((total, event) => total + event.count, 0);

  return (
    <main className="section surface-grid">
      <div className="page-shell">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-sm font-semibold text-indigo">Novus proof</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-normal">Safe event funnel for the demo audit.</h1>
            <p className="mt-4 max-w-3xl leading-7 text-slate-700">
              The app loads the Novus/Pendo web SDK, initializes an anonymous visitor, and forwards SwarmProof funnel events through a sanitizer. The dashboard screenshot should show these same event names after the deployed demo path is exercised.
            </p>
          </div>
          <div className="rounded-ui border border-line bg-panel px-4 py-3">
            <p className="flex items-center gap-2 font-mono text-sm font-semibold text-emerald">
              <RadioTower className="h-4 w-4" aria-hidden="true" />
              SDK bridge active
            </p>
          </div>
        </div>

        <section className="mt-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-ui border border-line bg-panel p-5">
            <BarChart3 className="h-5 w-5 text-indigo" aria-hidden="true" />
            <p className="mt-4 font-mono text-3xl font-semibold">{eventCount}</p>
            <p className="mt-1 text-sm text-slate-600">Expected safe events in demo path</p>
          </div>
          <div className="rounded-ui border border-line bg-panel p-5">
            <CheckCircle2 className="h-5 w-5 text-emerald" aria-hidden="true" />
            <p className="mt-4 font-mono text-3xl font-semibold">{demoAudit.novusEvents.length}</p>
            <p className="mt-1 text-sm text-slate-600">Tracked funnel events represented</p>
          </div>
          <div className="rounded-ui border border-line bg-panel p-5">
            <LockKeyhole className="h-5 w-5 text-crimson" aria-hidden="true" />
            <p className="mt-4 font-mono text-3xl font-semibold">0</p>
            <p className="mt-1 text-sm text-slate-600">Raw content fields in analytics</p>
          </div>
        </section>

        <section className="mt-6 rounded-ui border border-line bg-panel p-5">
          <h2 className="text-lg font-semibold">Install and dashboard checklist</h2>
          <div className="mt-4 grid gap-3 text-sm leading-6 text-slate-700 md:grid-cols-3">
            <p className="rounded-ui bg-mist p-3"><span className="block font-semibold text-ink">Official SDK</span>Loaded from the Novus/Pendo install snippet in the root layout.</p>
            <p className="rounded-ui bg-mist p-3"><span className="block font-semibold text-ink">Anonymous identity</span>Uses a local anonymous visitor id and a SwarmProof public account id.</p>
            <p className="rounded-ui bg-mist p-3"><span className="block font-semibold text-ink">Safe payloads</span>URL, content, screenshot, token, email, password, and credential keys are dropped before analytics.</p>
          </div>
        </section>

        <section className="mt-6 rounded-ui border border-line bg-panel p-5">
          <h2 className="text-lg font-semibold">Event contract</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[44rem] border-collapse text-left text-sm">
              <thead className="border-b border-line text-slate-600">
                <tr>
                  <th className="py-3 pr-4 font-semibold">Event</th>
                  <th className="py-3 pr-4 font-semibold">Count</th>
                  <th className="py-3 pr-4 font-semibold">Allowed properties</th>
                </tr>
              </thead>
              <tbody>
                {demoAudit.novusEvents.map((event) => (
                  <tr key={event.name} className="border-b border-line last:border-b-0">
                    <td className="py-3 pr-4 font-mono font-semibold">{event.name}</td>
                    <td className="py-3 pr-4 font-mono">{event.count}</td>
                    <td className="py-3 pr-4 text-slate-700">{event.safeProps.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
