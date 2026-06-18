import { Events } from "@swarmproof/events";

export default function NovusProofPage() {
  return (
    <main className="section">
      <div className="page-shell">
        <p className="font-mono text-sm font-semibold text-indigo">Novus proof</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-normal">Event funnel scaffold</h1>
        <p className="mt-4 max-w-3xl leading-7 text-slate-700">
          This page mirrors safe local event names. The analytics workstream will connect the wrapper to Novus credentials.
        </p>
        <div className="mt-8 grid gap-3 md:grid-cols-2">
          {Object.values(Events).map((eventName) => (
            <div key={eventName} className="rounded-ui border border-line bg-panel p-4 font-mono text-sm">
              {eventName}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
