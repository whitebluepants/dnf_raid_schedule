# SDD ledger — plan: docs/superpowers/plans/2026-08-19-dnf-raid-scheduler-mvp.md

Worktree: `/Users/whitebluepants/Documents/dnf_schedule/.worktrees/dnf-scheduler-mvp`
Branch start: `86d7139`
Spec reachable: `docs/superpowers/specs/2026-08-19-dnf-raid-scheduler-design.md`

## Preflight self-consistency scan

| Task | Internal check | Finding / ruling |
|---|---|---|
| 1 | Test, files, scripts, and foundation interface agree | Clean. Health behavior is observable and precedes implementation. |
| 2 | Migration, clients, types, and tests agree | Ruling: execute migrations against local Supabase for behavior checks when possible; source-text assertions may cover security declarations only when the local harness cannot expose catalog state. Cost if wrong: migration defects could escape until integration testing. |
| 3 | Domain types, scoring, validation, generation, and candidate APIs agree | Clean. Pure module has no Supabase/React dependency. |
| 4 | UI primitive files and accessibility tests agree | Clean. |
| 5 | Auth schemas/actions/pages agree | Clean. |
| 6 | Roster schemas/repository/actions/UI agree | Clean. |
| 7 | Activities, waves, registration, and difficulty permissions agree | Ruling: role authorization belongs in repository/RLS tests, not Zod schema tests. Cost if wrong: schema-only tests could falsely imply authorization. |
| 8 | SQL functions, repository, and concurrency requirements agree | Ruling: replace planned RPC `generate_schedule_snapshot` with `replace_schedule_snapshot`; TypeScript Task 3 owns generation and SQL only validates/persists a proposed snapshot atomically. Cost if wrong: SQL and TypeScript algorithms could diverge. |
| 9 | Workbench commands, realtime, mobile, absence, and publish requirements agree | Clean, subject to Task 8 RPC rename ruling. |
| 10 | E2E, docs, secret checks, and deployment agree | Clean. Online migration/deployment is an external side effect and requires a user-visible confirmation at execution time. |

## Cross-task interface and file scan

| Producer / consumer | Shared file or interface | Finding / ruling |
|---|---|---|
| 1 -> 2 | package scripts, TypeScript alias, `env`, `Result` | Clean. |
| 1 -> 3 | Vitest and TypeScript harness | Clean. |
| 1 -> 4 | React/Tailwind/test harness | Clean. |
| 1 -> 5 | `Result`, environment, App Router | Clean. |
| 1 -> 6 | `Result`, test harness | Clean. |
| 1 -> 7 | `Result`, test harness | Clean. |
| 1 -> 8 | `Result`, test harness | Clean. |
| 1 -> 9 | component/test harness | Clean. |
| 1 <-> 10 | `.env.example` created then modified | Intentional sequential modification; Task 10 preserves secret warnings. |
| 2 -> 5 | Supabase server client, auth/profile/group schema | Clean. |
| 2 -> 6 | Supabase client and roster tables/types | Clean. |
| 2 -> 7 | activity, difficulty, and registration tables/types | Clean. |
| 2 -> 8 | schedule tables, weekly usage, RLS helpers | Clean. |
| 2 -> 9 | browser client and Realtime tables | Clean. |
| 2 <-> 8 | separate migration files in one directory | Clean; timestamp order is explicit. |
| 3 -> 8 | generated snapshot and validation shapes | Apply RPC rename ruling; repository accepts Task 3 output. |
| 3 -> 9 | generator, validator, candidate recommendations | Clean. |
| 4 -> 5 | form primitives | Clean. |
| 4 -> 6 | form/card/dialog primitives | Clean. |
| 4 -> 7 | form/card/select primitives | Clean. |
| 4 -> 9 | cards, badges, dialogs, app layout | Clean. |
| 5 -> 6 | authenticated profile/group context | Clean. |
| 5 -> 7 | authenticated profile/group role | Clean. |
| 5 -> 8 | leader/admin identity | Clean. |
| 6 -> 7 | owned characters available for registration | Clean. |
| 6 -> 9 | display data for candidate cards | Clean. |
| 7 -> 8 | events, waves, registrations, difficulty thresholds | Clean. |
| 7 -> 9 | event and signup page routes | Separate page files; clean. |
| 8 -> 9 | schedule mutation actions and optimistic versions | Apply RPC rename ruling; clean otherwise. |
| 1-9 -> 10 | full app and testable workflows | Clean. |

Ruling: the user explicitly changed execution preference to main-agent implementation with subagent review. Keep one implementation stream in this shared worktree; use subagents for bounded review and record findings before fixing them.

Task 1: fix round 1/5 (3 addressed, 0 open — env secret ignore, real lint coverage, Node 24 warning-free verification; commits 227cee8..76360b9)
Task 1: minor (deferred): unused ESLint configuration/dependencies remain while Biome owns the lint script.
Task 1: complete (commits 86d7139..76360b9, review clean)
Task 2: review found critical write-boundary gaps (direct schedule writes, hard deletes, cross-group target identities, and independent wave/event audit linkage). Root fixed them in 4519134: schedule and revision writes are reserved for the future transactional RPC, owner/group/event policies are insert/update-only where appropriate, dependent deletes are restricted, leader target checks require event-group membership, and revision wave/event linkage is composite. Schema integration and contract tests pass locally (16 total).
Task 2: complete pending combined re-review (commits 10076ed..4519134)
Task 3: complete (commits 89fe9f0; 10 scheduling tests, typecheck and lint pass). Deterministic pure TypeScript generator now ranks tier/metric/fame/id, prioritizes judgment/hard/normal waves, preserves locks, enforces weekly/account uniqueness during generation, emits gaps, and returns candidates.
Task 4: complete (commit 9727046 plus current activity page). Responsive shell, accessible primitives, realtime status badge, and a demo multi-wave workbench view are in place. Full suite currently passes (27 tests), typecheck/lint/build pass; build retains the known Next middleware deprecation/Edge-runtime warnings from the Supabase middleware foundation.
Combined review follow-up: review found locked-assignment bypasses, greedy account dead-ends, hard filtering of soft thresholds, missing team thresholds/order, and overly permissive group insertion. Root addressed these in the next fix commit: invalid locks are rejected as gaps, buffer selection avoids dealer-account dead-ends, reference thresholds no longer block generation, waveNumber is supported, and direct group insertion is removed pending an authenticated onboarding function. Added always-running migration contract assertions.
Task 5: partial (commit 4f76c6d). Added validated login/register/onboarding schemas and accessible login/register entry screens. Supabase server actions and invite-join RPC remain for the next pass.
Task 6: partial (commit c30e2b6). Added role-aware roster validation, a character list page, and metric display for C/奶. Repository/actions and live Supabase writes remain for the next pass.
Task 7: partial (current working tree). Added event signup page with participation/character selection and an admin difficulty settings page for normal/hard/judgment soft-reference configuration. Server actions and repository persistence remain for the next pass.
Task 8/9: partial (commits bdb838e, 0d394a0, 4a6d23b). Added authenticated group onboarding, roster/registration actions, transactional `replace_schedule_snapshot` with optimistic version checks and weekly usage reservation, plus browser Realtime subscriptions. Full local suite now passes (33 tests), typecheck/lint/build pass.
Deployment: Vercel preview project `dnf-raid-scheduler` is connected and the complete 48-file runtime deployment is READY at `dnf-raid-scheduler-l6xkhv2il-whitebluepants-projects.vercel.app`. The preview currently has Vercel access protection; a share URL can be generated for browser access. Production env vars and remote Supabase migrations are still pending user setup.
Final review follow-up: fixed archived-parent and absent-member checks in `replace_schedule_snapshot`, made registration replacement a single transactional RPC, changed mutating actions to reject zero-row updates, and mounted Realtime refresh on the activity page. Local migrations, typecheck, lint, and 33-test suite pass.
