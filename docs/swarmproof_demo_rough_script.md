# SwarmProof Demo Script

## 0. Setup Before Recording

Open these tabs before you start:

1. `https://swarm-proof-web.vercel.app`
2. `https://swarm-proof-web.vercel.app/audits/new`
3. Fresh verified Supabase report: `https://swarm-proof-web.vercel.app/audits/audit_6d0d09eb653e481c99/report`
4. Generated export: `https://swarm-proof-web.vercel.app/audits/audit_6d0d09eb653e481c99/tests`
5. Public share page: `https://swarm-proof-web.vercel.app/share/share_cbb8f175c2354fab8a`
6. Novus proof: `https://swarm-proof-web.vercel.app/novus-proof`

Use these live audit inputs:

Supabase:

- URL: `https://supabase.com/docs`
- Goal: `Find the Supabase Next.js quickstart and installation instructions. Explore public docs only. Stop before login, signup, or private data.`

Why this is the best live demo:

- It avoids the overly broad pricing requirement.
- It still tests a real public website.
- It produced a verified live result with `2 / 3 clean passes`.
- Normal and chaos succeeded.
- Mobile drifted into Supabase AI prompt/RLS docs and was blocked by the verifier.
- The report generated suggested fixes, a Playwright starter check, a PM-readable bug report, a PR-ready suggestion, and a public share page.

Do not use the old pricing goal for the recording unless you want a deliberate `0 / 3` partial report. Pricing made the task too broad for the current bounded Railway worker.

## 1. Two-Minute Spoken Script

Hello everyone, my name is Abhinav, and this is SwarmProof: AI users that test your product before real users suffer.

AI has made it easier than ever to ship software, but not easier to trust it. Stack Overflow says eighty-four percent of developers use or plan to use AI tools, while more developers distrust AI accuracy than trust it.

That is the problem SwarmProof solves: before real users hit your product, AI users try the journey first and show you exactly where confidence breaks.

Let's see how it works.

Here I give SwarmProof the public Supabase docs URL and a goal: find the Next.js quickstart and installation instructions. I also tell it to stay on public docs and stop before login, signup, or private data.

First it runs a safety preflight. It checks that the target is public, reachable, and not a private or local network route.

Now the interesting part starts. SwarmProof creates three agent runs: normal, mobile, and chaos. On this worker they run sequentially, not all at once, because each agent launches a fresh Chromium browser. That keeps the live demo stable on a small Railway worker.

Each persona starts from a clean browser context. No cookies, no session, no previous state. It opens the page like a user, observes visible links and buttons, chooses a safe next action, captures evidence, and sends the step back to SwarmProof.

The normal evaluator follows the obvious information scent. The mobile evaluator uses a phone-sized viewport, so it catches small-screen navigation friction. The chaos evaluator is more impatient and tests whether plausible but wrong paths appear.

While the agents run, SwarmProof is doing two things. The planner decides what each persona should try next, but the verifier decides whether the evidence actually satisfies the goal. A random docs page is not enough. The agent has to find evidence for Supabase, Next.js, and installation guidance.

Now the report is ready. This is the product value: not a vague AI opinion, but persona stories, evidence, success rate, missing requirements, and suggested fixes.

In this Supabase run, normal and chaos both found verifier-backed evidence. Mobile did something very realistic: it clicked plausible docs links, drifted into AI prompt and RLS policy docs, and the verifier blocked it because that was not coherent Next.js quickstart evidence. That is exactly the point. SwarmProof does not reward "a page loaded"; it checks whether the user goal was actually satisfied.

Then it turns that evidence into action: a Playwright starter check, a PM-readable bug report, and a PR-ready suggestion.

Finally, this is Novus-ready. The proof page shows the audit funnel, while analytics stay safe: no raw page content, credentials, screenshots, or private URLs are sent into tracking events.

That is SwarmProof: a swarm of AI users proving whether your product actually works before real users suffer.

## 2. Emergency 60-Second Version

Hello everyone, my name is Abhinav, and this is SwarmProof: AI users that test your product before real users suffer.

AI has made it easier to ship software, but not easier to trust it. Stack Overflow says eighty-four percent of developers use or plan to use AI tools, while more developers distrust AI accuracy than trust it.

Here I give SwarmProof a public Supabase docs URL and a goal: find the Next.js quickstart and installation instructions, while staying away from login, signup, and private data.

SwarmProof runs a safety preflight, then queues normal, mobile, and chaos browser personas. They run sequentially for stability, and each one starts with a clean Chromium browser.

While they run, each agent observes the live page, chooses safe human-like actions, captures evidence, and sends back progress.

The key is the verifier. SwarmProof does not just ask whether a page loaded. It checks whether the evidence actually satisfies the goal.

In this run, normal and chaos pass. Mobile drifts into nearby docs, and SwarmProof catches it instead of giving us a fake green check.

The final report gives persona stories, success rate, missing requirements, suggested fixes, a Playwright starter check, a bug report, and a PR-ready suggestion.

And Novus proof tracks the audit funnel without raw page content, credentials, screenshots, or private URLs.

That is SwarmProof: AI browser users, evidence-backed reports, and generated tests for the everyone-ships-now era.

## 3. Live Demo Notes

Expected live result for the verified Supabase goal:

- Score: `91`
- Outcome: partial, but demo-friendly.
- Persona success rate: `2 / 3 clean passes`.
- Normal evaluator: `SUCCEEDED`.
- Mobile evaluator: `BLOCKED`.
- Chaos explorer: `SUCCEEDED`.
- Mobile blocker: drifted from the Next.js quickstart path into Supabase AI prompt / RLS docs.
- Report includes suggested fixes and a PR-ready suggestion.

If the run is still in progress:

- Say: "This is expected on live public sites. We run one fresh Chromium browser per persona, sequentially, so the worker stays stable. The system preserves partial evidence as it arrives."

If one persona blocks:

- Say: "This is the useful failure case. The site is public and usable, but one persona drifted to nearby docs instead of satisfying the exact goal. SwarmProof turns that into a product navigation recommendation."

If all personas pass:

- Say: "This is the clean outcome: the personas found verifier-backed evidence for the task, and now we can save the path as a regression starter."

If the live worker is slow:

- Say: "Browser testing public websites is noisy, so I pre-ran the same audit. The important product behavior is that each run reaches a final status and produces a partial report when the web is messy."

If you need to explain why the browser is not visibly streaming:

- Say: "The Railway worker runs headless Playwright browsers. The live view shows the evidence stream: persona cards, screenshot frames, step logs, verifier state, and status changes. A live VNC browser stream would be a future Browserbase-style upgrade."

## 4. Chrome Rehearsal Timing

Chrome rehearsal, June 20, 2026:

- Fresh `/audits/new` loaded normally.
- Audit created successfully with Railway Postgres persistence.
- No `Supabase REST persistence failed with 520` error.
- Running page showed live persona cards, evidence frames, verifier status, step logs, and safe event counts.
- Final result settled quickly enough for a demo.
- Final report:
  - Report URL: `https://swarm-proof-web.vercel.app/audits/audit_6d0d09eb653e481c99/report`
  - Score: `91`
  - Outcome: `partial`
  - Persona success rate: `2 / 3 clean passes`
  - Normal: `SUCCEEDED`
  - Mobile: `BLOCKED`
  - Chaos: `SUCCEEDED`
- Generated export:
  - `https://swarm-proof-web.vercel.app/audits/audit_6d0d09eb653e481c99/tests`
  - Includes Playwright starter check, bug report export, and PR-ready suggestion.
- Public share:
  - `https://swarm-proof-web.vercel.app/share/share_cbb8f175c2354fab8a`
  - The shared page is intentionally sanitized and omits secrets, credentials, raw target content, and private URLs.
- Novus proof:
  - `https://swarm-proof-web.vercel.app/novus-proof`
  - Shows the safe funnel event contract and sanitizer boundary.

## 5. Quant Source Notes

- Stack Overflow Developer Survey 2025: 84% of respondents use or plan to use AI tools in development; 46% distrust AI-tool accuracy versus 33% who trust it.
- W3Techs, June 2026: JavaScript is used as a client-side programming language by 98.8% of websites.
