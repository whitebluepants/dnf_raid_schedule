# DNF Raid Scheduler MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy a multi-user DNF raid scheduling web app where members register characters and leaders generate, adjust, publish, and collaboratively view multi-wave rosters.

**Architecture:** A Next.js App Router application uses Supabase Auth, PostgreSQL, Row Level Security, database functions, and Realtime. Pure TypeScript domain modules own scoring, validation, and greedy schedule generation; server actions and repositories adapt those modules to persisted data; the workbench presents a responsive drag-and-click editing UI.

**Tech Stack:** Node.js 24, Next.js 16.3.1, React 19.2.8, TypeScript 7.0.2, Tailwind CSS 4.3.3, Supabase JS 2.112.3, Supabase SSR 0.12.4, Zod 4.4.3, dnd-kit 6.3.1, Vitest 4.1.11, Testing Library 16.3.2, Playwright 1.62.1.

**Spec:** `docs/superpowers/specs/2026-08-19-dnf-raid-scheduler-design.md`

## Global Constraints

- Authentication is email and password; onboarding also requires game nickname and a group invite code.
- Roles are `member`, `leader`, and `admin`; database RLS is the security boundary.
- A raid wave contains red, yellow, and green teams, each with one buffer slot and three dealer slots.
- The same character cannot be scheduled more than once in a game week across normal, hard, and judgment difficulties.
- The same game account cannot appear twice in one wave.
- Difficulty thresholds are administrator-managed data, not application constants.
- Automatic scheduling produces an editable draft, preserves locks, and prioritizes the maximum number of complete waves.
- Desktop editing supports drag/drop; mobile editing supports select-then-place and swap.
- Realtime updates improve feedback; database transactions, constraints, and optimistic versions provide correctness.
- No Supabase service-role key may enter client bundles or committed files.
- Every user-facing form is validated on both client and server boundaries.

## Planned File Structure

```text
src/
  app/
    (app)/
      activities/[eventId]/schedule/page.tsx
      activities/[eventId]/signup/page.tsx
      activities/page.tsx
      roster/page.tsx
      settings/difficulties/page.tsx
      layout.tsx
    (auth)/
      login/page.tsx
      register/page.tsx
      reset-password/page.tsx
    api/health/route.ts
    onboarding/page.tsx
    globals.css
    layout.tsx
    page.tsx
  components/
    app-shell.tsx
    realtime-status.tsx
    ui/{badge,button,card,dialog,input,select}.tsx
  features/
    activities/
      actions.ts
      activity-list.tsx
      event-form.tsx
      registration-form.tsx
      repository.ts
      schemas.ts
    auth/
      actions.ts
      auth-form.tsx
      onboarding-form.tsx
      schemas.ts
    roster/
      actions.ts
      character-form.tsx
      character-list.tsx
      repository.ts
      schemas.ts
    schedule-workbench/
      actions.ts
      candidate-pool.tsx
      hooks/use-schedule-realtime.ts
      repository.ts
      schedule-workbench.tsx
      team-board.tsx
    scheduling/
      candidates.ts
      generate-schedule.ts
      score.ts
      types.ts
      validate-schedule.ts
  lib/
    env.ts
    result.ts
    supabase/{client,middleware,server}.ts
  middleware.ts
supabase/
  migrations/{initial_schema,schedule_functions}.sql
  seed.sql
tests/
  components/
  e2e/
  features/
  helpers/
```

---

### Task 1: Application Foundation and Test Harness

**Files:**
- Create: `.nvmrc`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `postcss.config.mjs`
- Create: `eslint.config.mjs`
- Create: `vitest.config.ts`
- Create: `tests/setup.ts`
- Create: `src/lib/env.ts`
- Create: `src/lib/result.ts`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Create: `src/app/globals.css`
- Create: `src/app/api/health/route.ts`
- Test: `tests/app/health-route.test.ts`

**Interfaces:**
- Produces: `env(): { NEXT_PUBLIC_SUPABASE_URL: string; NEXT_PUBLIC_SUPABASE_ANON_KEY: string }`.
- Produces: `Result<T, E> = { ok: true; value: T } | { ok: false; error: E }`.
- Produces: npm scripts `dev`, `build`, `lint`, `typecheck`, `test`, `test:watch`, and `test:e2e`.

- [ ] **Step 1: Write the failing health route test**

```ts
import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/health/route";

describe("GET /api/health", () => {
  it("returns an explicit healthy response", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });
});
```

- [ ] **Step 2: Add pinned dependencies and test configuration**

Create `package.json` with Node `>=24 <25`, the versions in the plan header, jsdom tests, path alias `@/* -> src/*`, and scripts that run Vitest once by default. Add `.env.example` containing only public Supabase URL and anon-key placeholders plus server-only `SUPABASE_SERVICE_ROLE_KEY` with an explanatory warning.

- [ ] **Step 3: Run the test and verify the expected failure**

Run: `npm install && npm test -- tests/app/health-route.test.ts`

Expected: FAIL because `src/app/api/health/route.ts` does not exist.

- [ ] **Step 4: Implement the minimal foundation**

Implement `GET()` as `Response.json({ status: "ok" })`, a Chinese root page describing the scheduler, an accessible root layout, Tailwind imports, strict environment parsing, and the shared result union.

- [ ] **Step 5: Verify foundation quality**

Run: `npm test -- tests/app/health-route.test.ts && npm run typecheck && npm run lint && npm run build`

Expected: all commands PASS; build output includes `/` and `/api/health`.

- [ ] **Step 6: Commit**

```bash
git add .nvmrc .gitignore .env.example package.json package-lock.json tsconfig.json next.config.ts postcss.config.mjs eslint.config.mjs vitest.config.ts tests src
git commit -m "chore: scaffold DNF raid scheduler"
```

### Task 2: Supabase Schema, RLS, and Typed Clients

**Files:**
- Create: `supabase/migrations/202608190001_initial_schema.sql`
- Create: `supabase/seed.sql`
- Create: `src/lib/supabase/client.ts`
- Create: `src/lib/supabase/server.ts`
- Create: `src/lib/supabase/middleware.ts`
- Create: `src/middleware.ts`
- Create: `src/lib/database.types.ts`
- Test: `tests/database/schema.test.ts`

**Interfaces:**
- Produces: `createBrowserClient()` and async `createServerClient()`.
- Produces tables and enums named exactly as section 5 of the spec plus `event_character_registrations`.
- Produces helper SQL functions `is_group_member(group_id)`, `has_group_role(group_id, roles[])`, and `current_profile_id()`.

- [ ] **Step 1: Write schema contract tests**

Read the migration as text and assert it defines all required enums, tables, foreign keys, unique indexes, `updated_at` triggers, RLS enablement, and policies. Include explicit assertions for unique `(raid_event_id, profile_id)`, `(raid_event_id, character_id)`, `(raid_wave_id, team_color, slot_index)`, and `(game_week, character_id)`.

- [ ] **Step 2: Run the schema test and verify failure**

Run: `npm test -- tests/database/schema.test.ts`

Expected: FAIL because the migration is absent.

- [ ] **Step 3: Implement schema and security policies**

Create enums for member role, character role, strength tier, event state, registration state, difficulty code, team color, usage state, and revision action. Use UUID primary keys, timestamps, ownership foreign keys, check constraints for positive fame and metrics, and partial/compound indexes supporting event schedule reads.

RLS policies must enforce:

```text
profiles: owner reads/updates self; group peers read display profile
game_accounts/characters: owner writes; same-group members read
groups/group_members: members read; admins manage
difficulty_presets: members read; admins write
raid_events/waves/slots/revisions: members read; leaders/admins write
registrations: member writes own; leaders/admins read/write group registrations
weekly_usage: members read; leaders/admins write through transaction functions
```

- [ ] **Step 4: Add seed data and typed clients**

Seed normal, hard, and judgment presets with names only and disabled numeric thresholds rather than invented community values. Add cookie-aware browser/server clients and auth refresh middleware. Define generated-shape TypeScript types sufficient for every table, enum, insert, and update used by the app.

- [ ] **Step 5: Verify schema contracts and TypeScript**

Run: `npm test -- tests/database/schema.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase src/lib/supabase src/lib/database.types.ts src/middleware.ts tests/database
git commit -m "feat: add Supabase schema and row security"
```

### Task 3: Pure Scheduling Domain

**Files:**
- Create: `src/features/scheduling/types.ts`
- Create: `src/features/scheduling/score.ts`
- Create: `src/features/scheduling/validate-schedule.ts`
- Create: `src/features/scheduling/candidates.ts`
- Create: `src/features/scheduling/generate-schedule.ts`
- Test: `tests/features/scheduling/score.test.ts`
- Test: `tests/features/scheduling/validate-schedule.test.ts`
- Test: `tests/features/scheduling/generate-schedule.test.ts`

**Interfaces:**
- Produces: `generateSchedule(input: GenerateScheduleInput): GeneratedSchedule`.
- Produces: `validateSchedule(input: ValidateScheduleInput): ScheduleIssue[]`.
- Produces: `recommendCandidates(input: CandidateInput): RankedCandidate[]`.
- Consumes no database or React APIs.

- [ ] **Step 1: Define domain types and failing scoring tests**

Use string IDs and these public shapes:

```ts
type CharacterRole = "dealer" | "buffer";
type StrengthTier = "high" | "medium" | "low";
type TeamColor = "red" | "yellow" | "green";

interface CandidateCharacter {
  id: string;
  accountId: string;
  profileId: string;
  role: CharacterRole;
  fame: number;
  strengthTier: StrengthTier;
  damageScore: number | null;
  buffScore: number | null;
}
```

Assert tier dominates fame, role-specific metric breaks ties, and stable ID order makes results deterministic.

- [ ] **Step 2: Implement and verify scoring**

Run the scoring test to see missing exports, implement `scoreCandidate()` and `compareCandidates()`, then rerun until PASS.

- [ ] **Step 3: Write failing validation tests**

Cover duplicate weekly character, duplicate account within a wave, missing buffer, wrong-role slot, empty slot, below-threshold warning, and a fully valid `3 buffers + 9 dealers` wave. Assert issue codes and severities exactly.

- [ ] **Step 4: Implement validation**

Return structured issues `{ code, severity, waveId, slotId?, message }`. Duplicate weekly character and duplicate wave account are blocking; structure/threshold issues are warnings until publish policy evaluates them.

- [ ] **Step 5: Write failing generator tests**

Fixtures must prove the generator:

- creates two complete waves from 6 buffers and 18 dealers;
- schedules hard before normal;
- never duplicates a character or same-wave account;
- preserves locked assignments;
- leaves explicit gaps when buffers are scarce;
- places stronger candidates red, then yellow, then green;
- produces identical output for identical input.

- [ ] **Step 6: Implement the greedy generator and recommendations**

Implement immutable passes: validate locks, reserve locked candidates, sort waves, allocate buffers, allocate dealers, rank teams, emit gaps, then derive candidate recommendations using role, availability, account eligibility, tier, threshold fit, metric, fame, and stable ID.

- [ ] **Step 7: Verify the complete domain suite**

Run: `npm test -- tests/features/scheduling`

Expected: all scheduling tests PASS without Supabase environment variables.

- [ ] **Step 8: Commit**

```bash
git add src/features/scheduling tests/features/scheduling
git commit -m "feat: add deterministic raid scheduling engine"
```

### Task 4: Responsive UI Primitives and Application Shell

**Files:**
- Create: `src/components/ui/button.tsx`
- Create: `src/components/ui/input.tsx`
- Create: `src/components/ui/select.tsx`
- Create: `src/components/ui/card.tsx`
- Create: `src/components/ui/badge.tsx`
- Create: `src/components/ui/dialog.tsx`
- Create: `src/components/app-shell.tsx`
- Create: `src/components/realtime-status.tsx`
- Create: `src/app/(app)/layout.tsx`
- Test: `tests/components/app-shell.test.tsx`

**Interfaces:**
- Produces reusable ref-forwarding controls with `className`, disabled, focus, and error states.
- Produces `AppShell({ userName, role, children })`.
- Produces `RealtimeStatus({ state: "connected" | "connecting" | "offline" })`.

- [ ] **Step 1: Write failing shell accessibility tests**

Render the shell and assert one main landmark, labelled navigation links for “活动”“我的角色”“配置”, visible current nickname/role, keyboard focus styles, and a mobile navigation control.

- [ ] **Step 2: Verify the shell test fails**

Run: `npm test -- tests/components/app-shell.test.tsx`

Expected: FAIL because the components are missing.

- [ ] **Step 3: Implement primitives and shell**

Use semantic HTML, CSS variables, a restrained dark DNF-inspired palette, 44px minimum touch targets, visible focus rings, responsive navigation, and no image assets. Keep primitives focused and dependency-free except React.

- [ ] **Step 4: Verify UI foundations**

Run: `npm test -- tests/components/app-shell.test.tsx && npm run typecheck && npm run lint`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components src/app/'(app)' tests/components
git commit -m "feat: add responsive application shell"
```

### Task 5: Authentication and Group Onboarding

**Files:**
- Create: `src/features/auth/schemas.ts`
- Create: `src/features/auth/actions.ts`
- Create: `src/features/auth/auth-form.tsx`
- Create: `src/features/auth/onboarding-form.tsx`
- Create: `src/app/(auth)/login/page.tsx`
- Create: `src/app/(auth)/register/page.tsx`
- Create: `src/app/(auth)/reset-password/page.tsx`
- Create: `src/app/onboarding/page.tsx`
- Test: `tests/features/auth/schemas.test.ts`
- Test: `tests/features/auth/actions.test.ts`

**Interfaces:**
- Produces server actions `login`, `register`, `requestPasswordReset`, `logout`, and `joinGroup` returning `Result`.
- Consumes `createServerClient()` and SQL function `join_group_by_invite(invite_code, nickname)`.

- [ ] **Step 1: Write failing authentication schema tests**

Assert valid email/password/nickname/invite inputs pass; malformed email, password shorter than 8 characters, blank nickname, and invite code outside 6–64 characters fail with Chinese messages.

- [ ] **Step 2: Implement Zod schemas and verify tests**

Run the schema test to see failure, implement exact validation rules, then rerun until PASS.

- [ ] **Step 3: Write failing action tests with a mocked Supabase adapter**

Assert login maps invalid credentials to a safe Chinese error, registration never returns session tokens, password reset uses the configured origin, and group join forwards only validated nickname/invite code.

- [ ] **Step 4: Implement actions and pages**

Use server actions, redirect authenticated users without group membership to onboarding, preserve only non-sensitive form values after failure, add loading/disabled states, and never log credentials or invite codes.

- [ ] **Step 5: Verify authentication flow units**

Run: `npm test -- tests/features/auth && npm run typecheck && npm run lint`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/auth src/app/'(auth)' src/app/onboarding tests/features/auth
git commit -m "feat: add authentication and group onboarding"
```

### Task 6: Account and Character Roster Management

**Files:**
- Create: `src/features/roster/schemas.ts`
- Create: `src/features/roster/repository.ts`
- Create: `src/features/roster/actions.ts`
- Create: `src/features/roster/character-form.tsx`
- Create: `src/features/roster/character-list.tsx`
- Create: `src/app/(app)/roster/page.tsx`
- Test: `tests/features/roster/schemas.test.ts`
- Test: `tests/features/roster/repository.test.ts`
- Test: `tests/components/character-form.test.tsx`

**Interfaces:**
- Produces `listRoster(profileId)`, `createGameAccount`, `createCharacter`, `updateCharacter`, and `archiveCharacter`.
- Character form fields: account, name, class name, role, fame, strength tier, role-specific metric, and notes.

- [ ] **Step 1: Write failing roster validation tests**

Assert positive fame, required account/name/class/role/tier, non-negative optional metrics, dealer damage/buffer buff normalization, trimmed notes, and rejection of payload IDs not matching route ownership.

- [ ] **Step 2: Implement roster schemas**

Run schema tests to verify failure, implement Zod discriminated unions for dealer and buffer data, and rerun until PASS.

- [ ] **Step 3: Write failing repository authorization tests**

Mock the Supabase query boundary and assert repository methods scope writes by authenticated profile ID, return typed not-found/conflict errors, and never accept an owner ID from raw form data.

- [ ] **Step 4: Implement repository, actions, and UI**

Build account grouping, character create/edit/archive dialogs, freshness timestamp, role-specific metric labels, optimistic pending state, and empty/error states. Keep deleted characters archived so historical schedules remain readable.

- [ ] **Step 5: Verify roster feature**

Run: `npm test -- tests/features/roster tests/components/character-form.test.tsx && npm run typecheck && npm run lint`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/roster src/app/'(app)'/roster tests/features/roster tests/components/character-form.test.tsx
git commit -m "feat: add member roster management"
```

### Task 7: Activities, Waves, Difficulty Configuration, and Registration

**Files:**
- Create: `src/features/activities/schemas.ts`
- Create: `src/features/activities/repository.ts`
- Create: `src/features/activities/actions.ts`
- Create: `src/features/activities/activity-list.tsx`
- Create: `src/features/activities/event-form.tsx`
- Create: `src/features/activities/registration-form.tsx`
- Create: `src/app/(app)/activities/page.tsx`
- Create: `src/app/(app)/activities/[eventId]/signup/page.tsx`
- Create: `src/app/(app)/settings/difficulties/page.tsx`
- Test: `tests/features/activities/schemas.test.ts`
- Test: `tests/features/activities/repository.test.ts`

**Interfaces:**
- Produces `createRaidEvent`, `updateWaves`, `setRegistration`, `setMemberAttendance`, and `updateDifficultyPreset`.
- `createRaidEvent` accepts `{ title, eventDate, gameWeek, waves: Array<{ order: number; difficultyPresetId: string }> }`.

- [ ] **Step 1: Write failing activity schema tests**

Cover a valid eight-wave `7 hard + 1 normal` event, duplicate wave order, zero waves, invalid game-week key, thresholds below zero, member attempting to update difficulty, and registration containing another member's character.

- [ ] **Step 2: Implement activity schemas**

Use `YYYY-Www` game week keys, unique positive wave order, at least one wave, UUID preset IDs, and optional non-negative threshold values.

- [ ] **Step 3: Write failing repository tests**

Assert event creation inserts event and waves atomically, registration replaces only the caller's selected characters, absent status removes characters from the active candidate query without deleting rows, and leader reads include all group registrations.

- [ ] **Step 4: Implement repositories, actions, and pages**

Build activity cards, leader-only event dialog, ordered wave editor with difficulty select, member attendance toggle, bulk character checkboxes, and administrator difficulty table. Do not implement partial-wave availability.

- [ ] **Step 5: Verify activity feature**

Run: `npm test -- tests/features/activities && npm run typecheck && npm run lint`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/activities src/app/'(app)'/activities src/app/'(app)'/settings tests/features/activities
git commit -m "feat: add raid activities and registration"
```

### Task 8: Transactional Schedule Persistence and Concurrency

**Files:**
- Create: `supabase/migrations/202608190002_schedule_functions.sql`
- Create: `src/features/schedule-workbench/repository.ts`
- Create: `src/features/schedule-workbench/actions.ts`
- Test: `tests/database/schedule-functions.test.ts`
- Test: `tests/features/schedule-workbench/repository.test.ts`

**Interfaces:**
- Produces SQL RPCs `generate_schedule_snapshot`, `move_schedule_character`, `set_schedule_lock`, `mark_member_absent`, `publish_schedule`, and `restore_schedule_revision`.
- Produces repository methods with the same behaviors, returning a discriminated `ScheduleMutationResult` with `success`, `conflict`, `validation_error`, or `forbidden` status.

- [ ] **Step 1: Write failing SQL contract tests**

Assert the migration creates security-definer functions with explicit `search_path`, role checks, expected-version parameters, advisory/event locking, revision inserts, weekly usage reservation/release, and no public execution grants beyond authenticated users.

- [ ] **Step 2: Implement transaction functions**

Each mutation must lock the target event/waves, verify leader/admin membership, compare versions, validate character ownership/registration/attendance, enforce weekly character and wave account uniqueness, mutate slots and usage together, increment versions, and insert a revision.

- [ ] **Step 3: Write failing repository result-mapping tests**

Mock RPC responses for success, stale version, duplicate account, weekly character conflict, forbidden role, and unknown database error. Assert unknown errors expose a request ID but not SQL text.

- [ ] **Step 4: Implement repository and server actions**

Validate all payloads, call only named RPCs, map database codes to Chinese user messages, revalidate affected pages, and keep the service-role key out of this code path.

- [ ] **Step 5: Verify persistence contracts**

Run: `npm test -- tests/database/schedule-functions.test.ts tests/features/schedule-workbench/repository.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/202608190002_schedule_functions.sql src/features/schedule-workbench tests/database/schedule-functions.test.ts tests/features/schedule-workbench/repository.test.ts
git commit -m "feat: add transactional schedule mutations"
```

### Task 9: Schedule Workbench, Drag/Click Editing, Realtime, and Absence Recovery

**Files:**
- Create: `src/features/schedule-workbench/schedule-workbench.tsx`
- Create: `src/features/schedule-workbench/team-board.tsx`
- Create: `src/features/schedule-workbench/candidate-pool.tsx`
- Create: `src/features/schedule-workbench/hooks/use-schedule-realtime.ts`
- Create: `src/app/(app)/activities/[eventId]/schedule/page.tsx`
- Test: `tests/components/schedule-workbench.test.tsx`
- Test: `tests/features/schedule-workbench/realtime.test.ts`

**Interfaces:**
- Consumes scheduling domain functions from Task 3 and persistence actions from Task 8.
- Produces a role-aware workbench supporting `generate`, `move`, `swap`, `returnToPool`, `lock`, `undo`, `redo`, `markAbsent`, and `publish` commands.

- [ ] **Step 1: Write failing desktop workbench tests**

Render one wave and assert three labelled teams, four labelled slots per team, candidate filters, character cards with fame/tier/metric, drag move request, swap request, lock controls, visible warning badges, and generation preserving locks.

- [ ] **Step 2: Write failing mobile interaction tests**

At a narrow viewport, assert selecting a candidate then a slot moves it, selecting two occupied slots swaps them, Escape/cancel clears selection, and all targets remain keyboard accessible.

- [ ] **Step 3: Implement workbench UI**

Use dnd-kit sensors for pointer/touch/keyboard on desktop and the same command model for click placement. Keep server-confirmed state separate from optimistic pending commands; on conflict replace the affected state with server data and show an actionable banner.

- [ ] **Step 4: Write and implement realtime subscription tests**

Mock Supabase channel callbacks and assert connected/connecting/offline status, remote changes refresh only the current event, local pending command IDs are not applied twice, disconnect triggers backoff, and reconnect performs a full refresh.

- [ ] **Step 5: Implement absence replacement and publishing UI**

Mark absent without deleting schedule history, show red gaps at their prior slots, list ranked replacements, support one-click replace, block publish for weekly-character/account conflicts, require explicit confirmation for nonstandard role composition, and label post-publication edits.

- [ ] **Step 6: Verify workbench feature**

Run: `npm test -- tests/components/schedule-workbench.test.tsx tests/features/schedule-workbench/realtime.test.ts && npm run typecheck && npm run lint`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/schedule-workbench src/app/'(app)'/activities/'[eventId]'/schedule tests/components/schedule-workbench.test.tsx tests/features/schedule-workbench/realtime.test.ts
git commit -m "feat: add collaborative schedule workbench"
```

### Task 10: End-to-End Verification and Deployment Readiness

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/auth-roster.spec.ts`
- Create: `tests/e2e/schedule-flow.spec.ts`
- Create: `tests/e2e/concurrency.spec.ts`
- Create: `tests/helpers/seed-test-data.ts`
- Create: `README.md`
- Create: `vercel.json`
- Modify: `.env.example`

**Interfaces:**
- Produces documented local setup using Supabase CLI migrations and seeded test users.
- Produces a production checklist for Vercel and Supabase.

- [ ] **Step 1: Configure Playwright and deterministic seed helpers**

Use two isolated browser contexts for member/leader concurrency, stable seeded UUIDs, test-only users, and cleanup scoped to the test group. Never point destructive cleanup at a non-test Supabase project.

- [ ] **Step 2: Write end-to-end flows**

Cover:

```text
member registers -> joins group -> creates account/characters -> registers characters
leader creates 7 hard + 1 normal -> generates draft -> locks -> adjusts -> publishes
member sees published change through realtime
leader marks member absent -> replaces gap -> republishes
two leaders edit same slot -> second receives stale-version conflict and fresh data
```

- [ ] **Step 3: Run the full local quality gate**

Run: `npm test && npm run typecheck && npm run lint && npm run build && npm run test:e2e`

Expected: every command PASS.

- [ ] **Step 4: Write deployment and recovery documentation**

README must include exact commands for install, local Supabase start/reset, environment creation, dev server, tests, schema migration, Vercel environment variables, production deployment, invite rotation, data export, and rollback to the previous Vercel deployment/database migration boundary.

- [ ] **Step 5: Perform secret and artifact checks**

Run:

```bash
git grep -nE 'service_role|SUPABASE_SERVICE_ROLE_KEY=' -- ':!README.md' ':!.env.example'
git status --short
npm audit --omit=dev
```

Expected: no committed secret value, only intentional server-side variable-name references, clean worktree after commit, and no unresolved high/critical production vulnerability.

- [ ] **Step 6: Commit**

```bash
git add playwright.config.ts tests/e2e tests/helpers README.md vercel.json .env.example
git commit -m "test: verify complete raid scheduling workflow"
```

- [ ] **Step 7: Deploy and smoke test with user-authorized accounts**

Create or select the Supabase project, apply migrations, configure Auth redirect URLs and Realtime tables, connect the repository to Vercel, set environment variables, deploy production, and repeat registration, roster, generation, move, publish, realtime, and logout checks at the production URL. Record the Vercel deployment URL and Supabase migration version in the release notes without recording credentials.

## Parallel Execution Map

After Task 1 completes, Tasks 2, 3, and 4 can run in parallel because their file ownership is disjoint. Task 5 depends on Tasks 1 and 2. Task 6 depends on Tasks 1, 2, and 4. Task 7 depends on Tasks 1, 2, 4, and 6. Task 8 depends on Tasks 2, 3, and 7. Task 9 depends on Tasks 3, 4, 7, and 8. Task 10 depends on all previous tasks.

Each parallel worker must avoid `git add`, `git commit`, dependency upgrades, and edits outside its assigned file list. The primary agent reviews and commits completed work sequentially to avoid a shared-index race.
