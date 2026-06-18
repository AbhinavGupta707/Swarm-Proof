# SwarmProof Agent Instructions

## Required Diagnosis Order

- Diagnose in layer order, not by symptom: if a feature is missing, unavailable, or not listed, first check registration, discovery, install state, and official activation flows; only debug permissions or runtime after the feature is actually present.

## Project Source Of Truth

- Read `swarmproof_build_ready_spec.md` first.
- Read `swarmproof_codex_execution_brief.md` second when planning or running implementation work.
- Treat the Devpost deadline as June 20, 2026 at 5:00 PM BST.
- Prioritize a public deployed product with Novus installed over broader feature completeness.

## Hackathon Build Priorities

- The MVP must let a stranger use a public URL and get value immediately.
- The reliable demo path on `/demo-target` is mandatory. External URL auditing can be partial if blockers are handled clearly.
- Do not claim private-app support, security scanning, accessibility certification, or human-equivalent usability testing.
- Keep Novus/Pendo event properties free of raw target-page content, credentials, private URLs, screenshots, or user secrets.

## Parallel Work Rules

- Keep workstreams file-scoped. Do not edit another stream's owned files unless a merge or integration step requires it.
- Verify before handoff. Run the smallest relevant check first, then broader lint/type/build checks when available.
- If merging branches or integrating another agent's work, inspect registration/discovery/configuration first, then runtime behavior.
- Preserve unrelated user or agent changes. Do not reset or revert work you did not make.

## Expected Validation Gates

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test` when tests exist
- `pnpm build`
- One manual or Playwright smoke path for: landing -> demo audit -> running -> report -> share/test export

If a command is unavailable because the repo is not bootstrapped yet, implement or document the missing script instead of treating the feature as broken.
