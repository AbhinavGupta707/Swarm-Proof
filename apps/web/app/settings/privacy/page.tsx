export default function PrivacyPage() {
  return (
    <main className="section">
      <div className="page-shell max-w-3xl">
        <p className="font-mono text-sm font-semibold text-indigo">Privacy</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-normal">Only test sites you own or have permission to test.</h1>
        <div className="mt-6 grid gap-4 leading-7 text-slate-700">
          <p>SwarmProof stores audit metadata, step evidence, generated reports, and event counts needed to explain a run.</p>
          <p>Novus/Pendo events must only receive counts, booleans, categories, and state transitions. Do not send raw target-page content, credentials, screenshots, or private URLs.</p>
          <p>The MVP blocks private/internal hosts and does not accept credentials.</p>
        </div>
      </div>
    </main>
  );
}
