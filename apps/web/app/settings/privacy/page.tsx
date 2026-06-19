import { Ban, Database, GlobeLock, ShieldCheck } from "lucide-react";

const policies = [
  {
    icon: ShieldCheck,
    title: "Permission-first testing",
    body: "Only test public products you own or have permission to evaluate. The MVP does not accept credentials or bypass login, CAPTCHA, 2FA, or paywalls."
  },
  {
    icon: Database,
    title: "Stored audit data",
    body: "SwarmProof stores audit metadata, persona state, issue categories, generated reports, and evidence references needed to explain a run."
  },
  {
    icon: GlobeLock,
    title: "Safe analytics boundary",
    body: "Novus/Pendo events receive counts, booleans, categories, and state transitions only. Raw page content, screenshots, credentials, and private URLs stay out of analytics."
  },
  {
    icon: Ban,
    title: "Private host blocking",
    body: "Internal hosts and private network targets are blocked before runtime. Auth-limited pages receive a clear partial report instead of a false pass."
  }
];

export default function PrivacyPage() {
  return (
    <main className="section">
      <div className="page-shell">
        <p className="font-mono text-sm font-semibold text-indigo">Privacy</p>
        <h1 className="mt-2 max-w-3xl text-4xl font-semibold tracking-normal">Only test sites you own or have permission to test.</h1>
        <p className="mt-4 max-w-3xl leading-7 text-slate-700">
          SwarmProof is a behavioral smoke-test tool for public product flows. It is not a private-app scanner, accessibility certification product, or human-equivalent usability study.
        </p>
        <section className="mt-8 grid gap-4 md:grid-cols-2">
          {policies.map((policy) => (
            <article key={policy.title} className="rounded-ui border border-line bg-panel p-5">
              <policy.icon className="h-5 w-5 text-indigo" aria-hidden="true" />
              <h2 className="mt-4 text-lg font-semibold">{policy.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-700">{policy.body}</p>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
