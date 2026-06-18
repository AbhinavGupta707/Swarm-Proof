import Link from "next/link";

export default function DemoSignupPage() {
  return (
    <main className="section">
      <div className="page-shell max-w-xl">
        <div className="max-h-[420px] overflow-hidden rounded-ui border border-line bg-panel p-5 sm:max-h-none">
          <p className="font-mono text-sm font-semibold text-indigo">Signup</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-normal">Create your workspace</h1>
          <p className="mt-3 text-sm leading-6 text-slate-700">
            Intentional mobile bug: the panel is clipped on small screens, hiding the primary CTA.
          </p>
          <label className="mt-6 block text-sm font-semibold" htmlFor="email">Email</label>
          <input className="mt-2 min-h-11 w-full rounded-ui border border-line px-3" id="email" defaultValue="demo@example.com" />
          <label className="mt-5 block text-sm font-semibold" htmlFor="password">Password</label>
          <input className="mt-2 min-h-11 w-full rounded-ui border border-line px-3" id="password" type="password" defaultValue="TestPassword123!" />
          <div className="mt-36 sm:mt-6">
            <Link className="block rounded-ui bg-emerald px-5 py-3 text-center font-semibold text-white" href="/demo-target/projects/new">
              Create account
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
