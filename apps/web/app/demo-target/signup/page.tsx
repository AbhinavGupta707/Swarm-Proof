import Link from "next/link";
import { LockKeyhole, Mail, Sparkles } from "lucide-react";

export default function DemoSignupPage() {
  return (
    <main className="section surface-grid">
      <div className="page-shell max-w-xl">
        <div className="max-h-[420px] overflow-hidden rounded-ui border border-line bg-panel p-5 shadow-sm sm:max-h-none">
          <p className="font-mono text-sm font-semibold text-indigo">Acme Launchpad</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-normal">Create your workspace</h1>
          <p className="mt-3 text-sm leading-6 text-slate-700">
            Start with a private launch room for your product team.
          </p>

          <div className="mt-6 grid gap-4">
            <label className="block text-sm font-semibold" htmlFor="email">
              Email
            </label>
            <div className="flex min-h-11 items-center gap-2 rounded-ui border border-line px-3">
              <Mail className="h-4 w-4 text-slate-500" aria-hidden="true" />
              <input className="min-h-10 flex-1 border-0 bg-transparent text-base" id="email" defaultValue="demo@example.com" />
            </div>

            <label className="block text-sm font-semibold" htmlFor="password">
              Password
            </label>
            <div className="flex min-h-11 items-center gap-2 rounded-ui border border-line px-3">
              <LockKeyhole className="h-4 w-4 text-slate-500" aria-hidden="true" />
              <input className="min-h-10 flex-1 border-0 bg-transparent text-base" id="password" type="password" defaultValue="TestPassword123!" />
            </div>
          </div>

          <div className="mt-10 rounded-ui border border-line bg-mist p-4">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="h-4 w-4 text-indigo" aria-hidden="true" />
              Workspace includes
            </p>
            <ul className="mt-3 grid gap-2 text-sm text-slate-700">
              <li>Project launch checklist</li>
              <li>Collaborator invites</li>
              <li>Customer feedback notes</li>
            </ul>
          </div>

          <div className="mt-36 sm:mt-6">
            <Link className="block min-h-11 rounded-ui bg-emerald px-5 py-3 text-center font-semibold text-white hover:bg-emerald/90" href="/demo-target/projects/new">
              Create account
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
