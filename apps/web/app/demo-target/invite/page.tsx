import { AlertTriangle, Users } from "lucide-react";

export default function InvitePage() {
  return (
    <main className="section bg-panel">
      <div className="page-shell max-w-2xl">
        <p className="font-mono text-sm font-semibold text-indigo">Team</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-normal">People</h1>
        <p className="mt-4 leading-7 text-slate-700">
          Manage who can view launch tasks, customer notes, and decision logs for Launch review.
        </p>

        <section className="mt-6 rounded-ui border border-line bg-mist p-5">
          <div className="flex items-center gap-3 border-b border-line pb-4">
            <Users className="h-5 w-5 text-indigo" aria-hidden="true" />
            <div>
              <p className="font-semibold">Workspace access</p>
              <p className="text-sm text-slate-600">2 active members</p>
            </div>
          </div>
          <label className="mt-5 block text-sm font-semibold" htmlFor="inviteEmail">Email</label>
          <input className="mt-2 min-h-11 w-full rounded-ui border border-line bg-panel px-3 text-base" id="inviteEmail" defaultValue="not-an-email" />
          <button className="mt-6 min-h-11 rounded-ui bg-emerald px-5 py-3 font-semibold text-white hover:bg-emerald/90" type="button">
            Add people
          </button>
          <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-crimson">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            Something went wrong.
          </p>
        </section>
      </div>
    </main>
  );
}
