export default function InvitePage() {
  return (
    <main className="section">
      <div className="page-shell max-w-2xl">
        <p className="font-mono text-sm font-semibold text-indigo">Team</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-normal">People</h1>
        <div className="mt-6 rounded-ui border border-line bg-panel p-5">
          <p className="text-sm leading-6 text-slate-700">
            Intentional wording bug: users looking for "invite teammate" may miss that "Add people" is the primary action.
          </p>
          <label className="mt-5 block text-sm font-semibold" htmlFor="inviteEmail">Email</label>
          <input className="mt-2 min-h-11 w-full rounded-ui border border-line px-3" id="inviteEmail" defaultValue="not-an-email" />
          <button className="mt-6 rounded-ui bg-emerald px-5 py-3 font-semibold text-white" type="button">
            Add people
          </button>
          <p className="mt-4 text-sm text-crimson">Something went wrong.</p>
        </div>
      </div>
    </main>
  );
}
