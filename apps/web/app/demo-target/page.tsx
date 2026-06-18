import Link from "next/link";

export default function DemoTargetPage() {
  return (
    <main className="section bg-panel">
      <div className="page-shell grid gap-8 lg:grid-cols-2 lg:items-center">
        <div>
          <p className="font-mono text-sm font-semibold text-indigo">Acme Launchpad</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-normal">Ship small product experiments with your team.</h1>
          <p className="mt-4 leading-7 text-slate-700">
            This intentionally flawed SaaS flow is the reliable SwarmProof audit target.
          </p>
          <Link className="mt-8 inline-block rounded-ui bg-emerald px-5 py-3 font-semibold text-white" href="/demo-target/signup">
            Get started
          </Link>
        </div>
        <div className="rounded-ui border border-line bg-mist p-5">
          <div className="rounded-ui border border-line bg-panel p-5">
            <p className="font-semibold">Today</p>
            <div className="mt-4 grid gap-3">
              <div className="h-12 rounded-ui bg-emerald/20" />
              <div className="h-12 rounded-ui bg-indigo/20" />
              <div className="h-12 rounded-ui bg-amber/20" />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
