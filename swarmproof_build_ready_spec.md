# SwarmProof Build-Ready Product and Implementation Specification

**Working title:** SwarmProof  
**Product family:** UserSwarm + ChaosUser + FlowProof  
**Tagline:** AI users test your product before real users suffer.  
**Primary hackathon:** Mind the Product World Product Day 2026  
**Document status:** Build-ready handoff for Codex/engineering agents.  
**Primary constraint:** Must be usable from a public deployed URL. No extension, no desktop app.

---

## 0. One-paragraph build instruction for coding agents

Build a public web app where a user enters a live product URL and a goal, then SwarmProof launches AI browser users to attempt the goal, including normal, mobile, impatient, and chaos behavior. The product must show live progress, screenshots, pass/fail evidence, UX friction, console/network errors where possible, and a generated Playwright test or bug report for failures. The MVP must include a built-in demo target app with intentional bugs so the public demo is reliable even if external sites block automation. Fireworks is the default model provider. Browser execution can use a Playwright worker service, Browserbase/Stagehand if available, or deterministic demo mode as fallback. Novus must be installed on the web app and all agent progress must be mirrored into auditable dashboard events.

---

## 1. Hackathon fit and success criteria

### Why this can win

SwarmProof directly matches the hackathon’s thesis: everyone can ship now, but shipped products still need to work for real users. It is public-URL-native and Novus-native. It creates visible product behavior that judges can understand: a product URL goes in, AI users try it, a report with evidence comes out.

It scores strongly on:

- **Product Thinking:** solves a real pain for AI builders, PMs, founders, designers, and small SaaS teams.
- **Craft and Execution:** clear funnel, live run UI, replays, reports, generated tests.
- **Originality/Ambition:** multiple AI personas and chaos users testing live products.
- **Shippedness:** product can be clicked and used on a public URL.

### Definition of done for hackathon submission

A submission is complete only if deployed SwarmProof can:

1. Accept a product URL and goal.
2. Run against the built-in demo target app end-to-end.
3. Launch at least 3 personas: normal, mobile, chaos.
4. Produce per-persona progress logs and screenshots.
5. Detect at least one intentionally seeded issue in the demo target.
6. Generate a PM-readable report.
7. Generate at least one Playwright test for a failed path.
8. Create a public shareable audit report.
9. Emit Novus-tracked events for URL submitted, run started, step completed, issue found, report opened, export clicked.

---

## 2. Product positioning

### User pain

AI tools make shipping faster, but product confidence has not kept up. A solo builder can create a full app in a day, but they may not know whether onboarding works, mobile layout is broken, copy is confusing, forms accept invalid data, or key CTAs are discoverable.

### Primary users

- AI builders submitting hackathon projects.
- Solo founders with no QA team.
- PMs and designers checking a release.
- Engineers who need quick behavioral smoke tests.
- Agencies shipping client sites.

### Product promise

> Paste a URL, describe the user goal, and watch AI users find where the product breaks or confuses people.

### Non-goals

- Not a replacement for human research.
- Not universal crawling of authenticated private apps.
- Not CAPTCHA/2FA bypass.
- Not automatic code patching for arbitrary repos in MVP.
- Not a legal/accessibility certification tool.

---

## 3. Core user journeys

### Journey A: reliable demo path

1. User clicks “Try demo audit.”
2. App targets internal demo SaaS app at `/demo-target`.
3. Goal is prefilled: “Sign up, create a project, invite a teammate.”
4. Three agents run.
5. Normal agent succeeds until invite step but cannot find CTA.
6. Mobile agent detects hidden CTA or overflow.
7. Chaos agent double-clicks submit and creates duplicate/invalid state.
8. Report shows issues, screenshots, replay links, and generated Playwright test.

### Journey B: user’s public URL

1. User enters URL and goal.
2. App runs preflight check.
3. If login/CAPTCHA blocks test, app shows “public/auth-limited report.”
4. If accessible, agents run.
5. Report generated.

### Journey C: PM acceptance-test mode

1. User enters URL and a list of acceptance criteria.
2. Planner turns criteria into goals.
3. Agents test each goal.
4. Report maps each criterion to pass/fail evidence.

MVP should prioritize Journey A and B. Journey C can be implemented as a text variant of the same audit form.

---

## 4. App routes and screens

Use Next.js App Router.

```txt
/                                  Landing page
/audits/new                         New audit form
/audits/[auditId]/running            Live run dashboard
/audits/[auditId]/report             Report view
/audits/[auditId]/replay/[runId]     Screenshot/trace replay view
/audits/[auditId]/tests              Generated tests and bug tickets
/demo-target                         Built-in target app landing
/demo-target/signup                  Buggy signup flow
/demo-target/projects/new            Buggy project creation flow
/demo-target/invite                  Buggy invite teammate flow
/share/[shareToken]                  Public read-only report
/settings/privacy                    Privacy and URL handling
/novus-proof                         Event proof page
```

### Screen-level requirements

#### Landing

- Headline: “AI users test your product before real users suffer.”
- CTA: “Run demo audit” and “Test my URL.”
- Explain 3 outputs: friction report, replay evidence, generated tests.

#### New Audit

Fields:

- URL input.
- Goal input.
- Mode checkboxes: normal, mobile, chaos, accessibility-lite.
- Max steps slider, default 15.
- “Use built-in demo app” button.

#### Running

- Progress cards per persona.
- Step log with icons.
- Latest screenshot thumbnail.
- Issue counter.
- Stop/cancel button.
- Polling or Supabase Realtime updates.

#### Report

Sections:

- Overall result: pass/fail/partial.
- User success rate.
- Time-to-value estimate.
- Friction points.
- Per-persona story.
- Evidence screenshots.
- Console/network issues if captured.
- Suggested fixes.
- Generated Playwright test.
- Export bug report.

#### Demo target app

Build this inside the same web app so the demo cannot fail because of external websites.

Intentional bugs:

1. Mobile signup modal has hidden CTA below fold.
2. Invite teammate CTA label is confusing or hidden behind “People.”
3. Double-click create project creates duplicate projects.
4. Invalid email is accepted then crashes/informs badly.

---

## 5. Tech stack

### Required

```txt
Runtime: Node 20+
Package manager: pnpm
Frontend: Next.js App Router, TypeScript, Tailwind, shadcn/ui
Database: Supabase Postgres or Neon Postgres
Storage: Supabase Storage or Cloudflare R2
ORM: Prisma or Drizzle; use Prisma if no preference
AI provider: Fireworks through provider wrapper
Browser execution: Playwright worker service; Browserbase/Stagehand adapter optional
Queue: Inngest, Trigger.dev, or simple DB polling queue; prefer Inngest if available
Realtime: Supabase Realtime or polling every 2s
Analytics: Novus install + custom trackEvent wrapper
Deployment: Vercel for web, Render/Fly/Railway for browser worker if not using Browserbase
```

### Browser execution options

#### Option 1, preferred for reliability if credentials available: Browserbase + Stagehand

- Hosted browsers avoid deployment friction.
- Stagehand provides `act`, `extract`, `observe`, and `agent` primitives.
- Likely paid after free limits.

#### Option 2, lower external dependency: self-hosted Playwright worker

- `apps/browser-worker` runs Express/Fastify + Playwright Chromium.
- Deploy to Render/Fly/Railway with Docker.
- More DevOps friction but less provider lock-in.

#### Option 3, demo fallback: deterministic run on `/demo-target`

- If browser provider is unavailable, the demo target can run scripted Playwright paths to show full product behavior.
- Must be labeled as demo mode in code, not hidden from judges.

Implement a provider abstraction so the app can switch.

---

## 6. Recommended repo structure

```txt
swarmproof/
  apps/
    web/
      app/
        audits/
        demo-target/
        api/
      components/
      lib/
    browser-worker/
      src/
        index.ts
        providers/
        runners/
        agents/
        evidence/
      Dockerfile
  packages/
    types/
      audit.ts
      browser.ts
      agent.ts
    db/
      prisma/schema.prisma
      client.ts
    ai/
      provider.ts
      prompts.ts
      schemas.ts
    events/
      track.ts
      event-names.ts
    testgen/
      playwright-template.ts
    fixtures/
      demo-audits/
  docs/
    build-spec.md
    demo-script.md
```

---

## 7. Environment variables

```bash
DATABASE_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_STORAGE_BUCKET=swarmproof
FIREWORKS_API_KEY=
FIREWORKS_MODEL=
BROWSER_PROVIDER=local|browserbase|demo
BROWSER_WORKER_URL=
BROWSERBASE_API_KEY=
BROWSERBASE_PROJECT_ID=
NEXT_PUBLIC_APP_URL=
NOVUS_*                 # generated by Novus install PR
```

---

## 8. Data model

### Prisma schema outline

```prisma
model Audit {
  id          String   @id @default(cuid())
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  targetUrl   String
  goal        String
  status      AuditStatus @default(CREATED)
  modes       Json
  shareToken  String? @unique
  runs        AgentRun[]
  issues      Issue[]
  events      EventLog[]
  report      AuditReport?
}

enum AuditStatus {
  CREATED
  PREFLIGHT
  RUNNING
  COMPLETED
  FAILED
  CANCELLED
}

model AgentRun {
  id          String   @id @default(cuid())
  auditId     String
  audit       Audit    @relation(fields: [auditId], references: [id])
  persona     String
  viewport    String
  status      RunStatus @default(PENDING)
  startedAt   DateTime?
  finishedAt  DateTime?
  success     Boolean?
  summary     String?
  steps       BrowserStep[]
  artifacts   Artifact[]
}

enum RunStatus {
  PENDING
  RUNNING
  SUCCEEDED
  FAILED
  BLOCKED
}

model BrowserStep {
  id          String @id @default(cuid())
  runId       String
  run         AgentRun @relation(fields: [runId], references: [id])
  stepIndex   Int
  action      String
  thought     String?
  selector    String?
  value       String?
  url         String?
  result      String
  screenshotUrl String?
  createdAt   DateTime @default(now())
}

model Issue {
  id          String @id @default(cuid())
  auditId     String
  audit       Audit @relation(fields: [auditId], references: [id])
  severity    IssueSeverity
  category    String
  title       String
  description String
  evidenceStepIds Json
  suggestedFix String?
  generatedTest String?
  createdAt   DateTime @default(now())
}

enum IssueSeverity {
  LOW
  MEDIUM
  HIGH
  CRITICAL
}

model Artifact {
  id        String @id @default(cuid())
  runId     String
  run       AgentRun @relation(fields: [runId], references: [id])
  type      ArtifactType
  url       String
  meta      Json?
  createdAt DateTime @default(now())
}

enum ArtifactType {
  SCREENSHOT
  TRACE_ZIP
  HAR
  CONSOLE_LOG
  VIDEO
}

model AuditReport {
  id          String @id @default(cuid())
  auditId     String @unique
  audit       Audit @relation(fields: [auditId], references: [id])
  summary     String
  score       Int
  reportJson  Json
  markdown    String
  createdAt   DateTime @default(now())
}

model EventLog {
  id        String @id @default(cuid())
  auditId   String?
  audit     Audit? @relation(fields: [auditId], references: [id])
  name      String
  props     Json?
  createdAt DateTime @default(now())
}
```

---

## 9. API contracts

All APIs return `{ ok: boolean, data?: T, error?: { code: string, message: string } }`.

```txt
POST /api/audits
Body: { targetUrl: string, goal: string, modes: string[], maxSteps?: number }
Returns: { auditId: string }

POST /api/audits/:id/preflight
Body: {}
Returns: { loadable: boolean, blockedReason?: string, normalizedUrl: string }

POST /api/audits/:id/run
Body: {}
Returns: { runIds: string[] }

GET /api/audits/:id
Returns: Audit with runs/issues/report summary

GET /api/audits/:id/events
Returns: recent events and step summaries

GET /api/audits/:id/report
Returns: full report

POST /api/audits/:id/generate-report
Body: {}
Returns: { reportId: string }

POST /api/audits/:id/share
Returns: { shareUrl: string }

GET /api/share/:token
Returns: public report

POST /api/events
Body: { name: string, auditId?: string, props?: object }
Returns: { ok: true }
```

### Browser worker API

```txt
POST /worker/run-agent
Body: {
  auditId: string,
  runId: string,
  targetUrl: string,
  goal: string,
  persona: PersonaConfig,
  maxSteps: number,
  callbackBaseUrl: string
}
Returns: { accepted: true }

POST /api/worker-callback/step
Body: { runId, stepIndex, action, thought, result, screenshotBase64?, url? }

POST /api/worker-callback/complete
Body: { runId, success, summary, issues?, artifacts? }
```

Worker callbacks allow the web app to display progress without the worker directly writing to the DB, reducing credential risk.

---

## 10. Agent architecture

### Persona configs

`packages/types/agent.ts`

```ts
export type PersonaMode = 'normal' | 'mobile' | 'impatient' | 'chaos' | 'accessibility_lite';

export type PersonaConfig = {
  id: string;
  mode: PersonaMode;
  name: string;
  viewport: { width: number; height: number; isMobile?: boolean };
  behaviorRules: string[];
  chaosRules?: string[];
};
```

Defaults:

```ts
normal = {
  mode: 'normal',
  viewport: { width: 1440, height: 900 },
  behaviorRules: ['Try to complete the goal like a reasonable first-time user.', 'Do not invent credentials unless asked.'],
}

mobile = {
  mode: 'mobile',
  viewport: { width: 390, height: 844, isMobile: true },
  behaviorRules: ['Use mobile viewport.', 'Notice hidden controls, overflow, tiny tap targets.'],
}

chaos = {
  mode: 'chaos',
  viewport: { width: 1366, height: 768 },
  behaviorRules: ['Try to complete the goal but behave like a messy real user.'],
  chaosRules: ['Double-click primary buttons once.', 'Paste long input once.', 'Use back button once.', 'Try invalid email once.'],
}
```

### Agent loop

Minimum reliable loop:

1. Navigate to target URL.
2. Capture page summary:
   - URL
   - title
   - visible text snippet
   - buttons/links/inputs with labels
   - screenshot
3. Ask Fireworks model for next action using strict JSON schema.
4. Execute action using Playwright.
5. Capture result.
6. Stop when goal completed, blocked, failed, or max steps reached.

### Action schema

```ts
export type AgentAction =
  | { type: 'click_text'; text: string; reason: string }
  | { type: 'fill_label'; label: string; value: string; reason: string }
  | { type: 'select_label'; label: string; value: string; reason: string }
  | { type: 'press'; key: string; reason: string }
  | { type: 'goto'; url: string; reason: string }
  | { type: 'wait'; ms: number; reason: string }
  | { type: 'back'; reason: string }
  | { type: 'screenshot'; reason: string }
  | { type: 'done'; reason: string; evidence: string }
  | { type: 'fail'; reason: string; evidence: string };
```

For Stagehand adapter, map actions to `act/extract/observe` as appropriate. For pure Playwright, implement robust helper methods:

- `clickByText(page, text)` tries role/button/link/text locators.
- `fillByLabel(page, label, value)` tries labels, placeholders, aria labels, name attributes.
- `extractVisibleElements(page)` returns semantic summaries.

### Issue detection

Detect issues from:

- agent failure action;
- repeated click with no page state change;
- console errors;
- network failures `>= 400`;
- overflow/hidden CTA for mobile, if detectable;
- chaos action causing duplicate state;
- max steps exceeded;
- model says goal is blocked/confusing.

---

## 11. Prompts and JSON schemas

### Planner prompt

System:

> You are a product QA planning agent. Convert a user goal into likely user steps. Do not assume private credentials. Return only JSON matching the schema.

Output schema:

```ts
{
  expectedSteps: string[];
  successCriteria: string[];
  likelyFrictionPoints: string[];
}
```

### Runner prompt

System:

> You are an AI user testing a website. You must complete the goal if possible. You can only choose actions from the provided action schema. You must behave according to the persona rules. Do not claim success unless page evidence supports it. Return only JSON.

User payload:

```json
{
  "goal": "...",
  "persona": {...},
  "page": {
    "url": "...",
    "title": "...",
    "visibleText": "...",
    "elements": [
      {"type":"button","text":"Get Started","label":"Get Started"}
    ]
  },
  "history": ["..."]
}
```

### Report prompt

System:

> You are a senior product manager writing an evidence-based product QA report. Use only the supplied browser steps, screenshots metadata, console/network errors, and agent outcomes. Do not invent. Output JSON and Markdown.

Output schema:

```ts
{
  summary: string;
  score: number;
  outcome: 'pass' | 'partial' | 'fail';
  issues: Array<{
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    category: string;
    title: string;
    description: string;
    evidenceStepIds: string[];
    suggestedFix: string;
  }>;
  playwrightTests: Array<{ name: string; code: string }>;
  markdown: string;
}
```

---

## 12. Generated Playwright test format

`packages/testgen/playwright-template.ts`

A generated test should be simple and readable.

```ts
import { test, expect } from '@playwright/test';

test('user can complete signup and invite teammate', async ({ page }) => {
  await page.goto('{{targetUrl}}');
  await page.getByRole('link', { name: /get started|sign up/i }).click();
  await page.getByLabel(/email/i).fill('demo@example.com');
  await page.getByLabel(/password/i).fill('TestPassword123!');
  await page.getByRole('button', { name: /create account|sign up/i }).click();
  await expect(page.getByText(/project/i)).toBeVisible();
});
```

If selectors are uncertain, generated tests should include comments:

```ts
// TODO: selector was inferred from agent trace; verify before committing.
```

---

## 13. Novus and analytics plan

Events:

```ts
export const Events = {
  AuditCreated: 'audit_created',
  UrlSubmitted: 'url_submitted',
  PreflightStarted: 'preflight_started',
  PreflightCompleted: 'preflight_completed',
  AgentRunStarted: 'agent_run_started',
  BrowserStepCompleted: 'browser_step_completed',
  PersonaBlocked: 'persona_blocked',
  IssueDetected: 'issue_detected',
  RunCompleted: 'run_completed',
  ReportGenerated: 'report_generated',
  ReplayOpened: 'replay_opened',
  TestExported: 'test_exported',
  ShareCreated: 'share_created',
} as const;
```

Never include target page private content in Novus event properties. Properties should be counts and booleans:

```ts
trackEvent(Events.IssueDetected, {
  auditId,
  severity,
  category,
  persona,
  stepIndex,
});
```

Build `/novus-proof` to show local `EventLog` funnel. The demo video should show Novus dashboard screenshot separately.

---

## 14. Security, privacy, and abuse controls

- Block internal/private IPs to avoid SSRF: `localhost`, `127.0.0.1`, private RFC1918 ranges, metadata IPs.
- Respect a max step/time budget per run.
- Do not accept credentials in MVP.
- Show warning: “Only test sites you own or have permission to test.”
- Store screenshots/traces under unguessable URLs.
- Allow user to delete audit.
- Rate-limit anonymous audits per IP.

---

## 15. Demo fixtures

### Built-in target app

Create `/demo-target` with seeded issues.

Screens:

```txt
/demo-target
/demo-target/signup
/demo-target/onboarding
/demo-target/projects
/demo-target/projects/new
/demo-target/invite
```

Seeded bugs:

1. Mobile CSS bug: fixed-height modal hides submit button.
2. Invite teammate page uses “Add people” but goal says invite teammate; some users may miss it.
3. Double-click project creation creates duplicate cards.
4. Invalid email in invite flow shows vague error.

### Demo audit fixture

`packages/fixtures/demo-audits/demo-target-audit.json` can preload a finished report for fallback mode.

---

## 16. Acceptance tests

### Unit tests

- Persona config validation.
- Action schema validation.
- Report schema validation.
- URL safety checker blocks private hosts.
- Test generator returns syntactically valid test string.

### E2E tests

1. Create demo audit.
2. Run audit on `/demo-target`.
3. Wait for completion.
4. Report shows at least one issue.
5. Generated test page shows code.
6. Share link opens public report.

### Manual demo acceptance

- Full demo run completes in under 3 minutes.
- At least 3 persona cards update live.
- Report contains screenshots.
- One generated test is visible.
- Novus event proof page shows full funnel.

---

## 17. Parallel Codex workstreams

### Merge strategy

1. Foundation branch creates monorepo, shared types, DB schema, event names, placeholder routes.
2. Browser worker depends on shared types only.
3. Web UI can use mocked audit data until backend is merged.
4. Demo target app is independent and should not conflict with UI/report work.
5. Merge order: foundation → demo target → backend/API → worker → UI live integration → report/testgen → analytics/polish.

### Workstream A: Foundation and shared contracts

**Branch:** `agent/swarm-foundation`  
**Owns:** root config, package setup, `packages/types`, `packages/db`, `packages/events`, placeholder app routes.  
**Goal command:**

> Create the SwarmProof monorepo with Next.js App Router, TypeScript, Tailwind, shadcn/ui, Prisma schema, shared audit/browser/agent types, event names, and placeholder routes. Ensure `pnpm lint`, `pnpm typecheck`, and `pnpm dev` work. Do not implement browser execution yet.

### Workstream B: Demo target app

**Branch:** `agent/swarm-demo-target`  
**Owns:** `apps/web/app/demo-target/**`, `apps/web/components/demo-target/**`.  
**Goal command:**

> Build the internal demo target SaaS app with signup, project creation, and invite teammate flows. Add intentional bugs described in the spec. Keep it visually credible and simple. Do not edit audit/report pages.

### Workstream C: Audit creation and backend APIs

**Branch:** `agent/swarm-api`  
**Owns:** `apps/web/app/api/audits/**`, DB access, URL safety, event logging.  
**Goal command:**

> Implement audit creation, preflight, run-start, event polling, report retrieval, and share APIs using the Prisma schema and shared types. Include URL safety checks and mock run support.

### Workstream D: Browser worker and agent runner

**Branch:** `agent/swarm-browser-worker`  
**Owns:** `apps/browser-worker/**`, `packages/ai/**` runner prompts if needed.  
**Goal command:**

> Implement the Playwright browser worker with provider abstraction. It should accept run-agent jobs, launch Chromium, execute persona action loops using Fireworks JSON actions, capture screenshots, detect console/network errors, and callback step/complete events to the web API. Include demo mode if no Fireworks key is present.

### Workstream E: Live run UI

**Branch:** `agent/swarm-live-ui`  
**Owns:** `/audits/new`, `/audits/[id]/running`, UI components for progress cards/logs/screenshots.  
**Goal command:**

> Build the audit creation form and live running dashboard. Use mocked data until APIs exist, then integrate with polling endpoint. Show persona cards, latest screenshots, step logs, issue count, and completion state.

### Workstream F: Report, replay, and test generation

**Branch:** `agent/swarm-report-testgen`  
**Owns:** `/audits/[id]/report`, `/replay`, `/tests`, `packages/testgen/**`, report AI prompt.  
**Goal command:**

> Implement the report view, replay screenshot timeline, generated Playwright test view, share page, and report-generation prompt. Use real audit data if available, otherwise fixture data. Export markdown bug report and test code.

### Workstream G: Novus/events/polish

**Branch:** `agent/swarm-analytics-polish`  
**Owns:** `packages/events/**`, `/novus-proof`, landing polish, demo script docs.  
**Goal command:**

> Wire all required event tracking into the user flows, build `/novus-proof`, polish landing page and demo path, and ensure sensitive data is not included in event properties.

---

## 18. Implementation schedule

### Day/night 1

- Foundation repo.
- Demo target app.
- Audit creation backend.
- Mock live UI.
- Browser worker skeleton.

### Day/night 2

- Real browser execution on demo target.
- Fireworks agent action loop.
- Report generation.
- Generated Playwright test.
- Share page.
- Novus install.

### Final polish

- Cost/time limits.
- Bug classification quality.
- Screenshots and replay.
- Demo video.
- Novus dashboard screenshot.

---

## 19. Fallbacks and hard lines

### Fallbacks

- If Browserbase/worker fails, demo mode replays fixture audit.
- If Fireworks fails, deterministic scripted agents test demo target.
- If external URL blocks automation, show preflight blocked report.
- If trace viewer is hard, use screenshot timeline.

### Hard lines

Do not claim:

- human-equivalent usability testing;
- full private app support;
- code patches for arbitrary codebases;
- accessibility certification;
- security testing or vulnerability scanning.

---


## Shared source and platform assumptions

These specs assume the following current platform constraints and capabilities:

- The Mind the Product submission must be a public deployed URL with Novus installed and a Novus dashboard screenshot. The Chrome-extension path is intentionally not used for these three product specs.
- Fireworks is the default model provider. All AI calls must go through a provider wrapper so the model can be swapped without touching product code.
- Novus/Pendo instrumentation must never receive raw health data, home floor plans, uploaded PDFs, medical text, or secret target URLs unless explicitly anonymized. Track events and state transitions, not sensitive content.
- Vercel + Supabase + Fireworks credits are the default low-cost stack. Browser execution for SwarmProof is the only likely non-free dependency unless a self-hosted worker is used.

Reference URLs for implementers:

- Novus/Pendo product memory: https://www.pendo.io/pendo-blog/introducing-novus//
- Fireworks docs: https://docs.fireworks.ai/getting-started/introduction
- Fireworks pricing: https://docs.fireworks.ai/serverless/pricing
- React Three Fiber docs: https://r3f.docs.pmnd.rs/getting-started/introduction
- Stagehand docs: https://stagehand.dev/
- Playwright trace viewer: https://playwright.dev/docs/trace-viewer
- ICO special category data: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/special-category-data/what-is-special-category-data/
- MHRA software and AI as medical device: https://www.gov.uk/government/publications/software-and-artificial-intelligence-ai-as-a-medical-device/software-and-artificial-intelligence-ai-as-a-medical-device
- London Planning Datahub: https://www.london.gov.uk/programmes-strategies/planning/digital-planning/planning-london-datahub
- Planning Data API: https://www.planning.data.gov.uk/docs
- Postcodes.io: https://postcodes.io/docs/api/
