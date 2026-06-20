# SwarmProof Demo Script

Canonical recording script lives in:

`docs/swarmproof_demo_rough_script.md`

Use this verified live audit input:

```text
URL:
https://supabase.com/docs

Goal:
Find the Supabase Next.js quickstart and installation instructions. Explore public docs only. Stop before login, signup, or private data.
```

Verified rehearsal artifacts:

- Report: `https://swarm-proof-web.vercel.app/audits/audit_6d0d09eb653e481c99/report`
- Generated export: `https://swarm-proof-web.vercel.app/audits/audit_6d0d09eb653e481c99/tests`
- Public share: `https://swarm-proof-web.vercel.app/share/share_cbb8f175c2354fab8a`
- Novus proof: `https://swarm-proof-web.vercel.app/novus-proof`

Expected story:

- Score: `91`
- `2 / 3 clean passes`
- Normal evaluator succeeds.
- Chaos explorer succeeds.
- Mobile evaluator blocks after drifting into nearby AI prompt / RLS docs.
- The report creates suggested fixes, a Playwright starter check, a bug report export, and a PR-ready suggestion.

For the full spoken script and fallback notes, use `docs/swarmproof_demo_rough_script.md`.
