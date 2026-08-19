# 团队排表工具 V1 完整可用化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成空间上下文、三层权限、真实角色／活动／报名／排表流程，使团体可以在生产环境日常开团。

**Architecture:** 所有业务数据以当前空间为范围；cookie 只存当前空间 ID，服务端及 RLS 均独立验证授权。数据库 RPC 负责敏感权限和并发排表写入，页面层负责表单体验和刷新真实数据。

**Tech Stack:** Next.js App Router、TypeScript、Tailwind CSS、Supabase Auth/PostgreSQL/RLS、Vitest。

**Spec:** `docs/superpowers/specs/2026-08-19-v1-completion-design.md`

## Global Constraints

- 永不把 Supabase service-role key、数据库连接串、邀请码摘要或用户密码写入客户端或仓库。
- 每个受保护写入均须验证认证用户、当前空间成员资格和相应空间角色；平台管理员的跨空间能力仅由数据库资料字段授予。
- 每个角色每周只能出现在一个有效波次，同一账号同一波不能重复，且每队固定 1 奶 + 3 C。
- 自动排表只能产生可编辑草稿，管理员始终可以手动调整和发布。
- 每个表单在客户端和服务端均验证；失败时展示可读中文错误。

---

### Task 1: 空间上下文、邀请码和权限边界

**Files:**
- Create: `supabase/migrations/202608190006_platform_admin_and_active_space.sql`
- Modify: `src/lib/database.types.ts`, `src/features/auth/actions.ts`, `src/features/auth/space-forms.tsx`, `src/app/(app)/spaces/page.tsx`, `src/app/(app)/layout.tsx`, `src/components/app-shell.tsx`, `.env.example`
- Create: `src/lib/current-space.ts`, `src/app/(app)/settings/members/page.tsx`, `src/features/auth/member-management.tsx`
- Test: `tests/database/platform-admin-migration.test.ts`, `tests/features/auth/current-space.test.ts`

**Interfaces:** `requireCurrentSpace(client)` returns `{ profileId, groupId, role, isPlatformAdmin }`; `setCurrentSpace(groupId)`, `createGroup(name)`, `joinGroup(inviteCode)`, and `setMemberRole(groupId, profileId, role)` return `Result`.

- [ ] Write failing authorization and current-space tests, including `蓝` bootstrap, creator admin, platform-admin role changes, member isolation and invalid cookie rejection.
- [ ] Implement migration/RLS/RPCs and typed database interfaces; initialize `蓝` only when matching an existing profile, never by an unauthenticated nickname claim.
- [ ] Implement current-space cookie actions and authenticated UI; generate invite codes server-side and replace typed-code creation UI.
- [ ] Verify unit/database contracts, typecheck and lint; commit.

### Task 2: 真实账号与角色管理

**Files:**
- Create: `src/features/roster/repository.ts`, `src/features/roster/character-form.tsx`, `src/features/roster/character-list.tsx`
- Modify: `src/features/roster/actions.ts`, `src/features/roster/schemas.ts`, `src/app/(app)/roster/page.tsx`
- Test: `tests/features/roster/repository.test.ts`, `tests/components/character-form.test.tsx`

**Interfaces:** `listRoster(groupId, profileId)` returns accounts with active characters; `saveCharacter(input)` creates or updates one owned character in current space; `archiveCharacter(id)` hides it from roster and future signup.

- [ ] Write failing tests for group-scoped listing, role-specific metric validation and edit/archive authorization.
- [ ] Implement repository and group-aware actions that write `group_id` to both accounts and characters.
- [ ] Implement accessible add/edit dialogs, account creation inline, empty state and success/error feedback.
- [ ] Verify feature tests, typecheck and lint; commit.

### Task 3: 活动、波次、难度与报名

**Files:**
- Create: `src/features/activities/schemas.ts`, `src/features/activities/repository.ts`, `src/features/activities/event-form.tsx`, `src/features/activities/registration-form.tsx`
- Modify: `src/features/activities/actions.ts`, `src/app/(app)/activities/page.tsx`, `src/app/(app)/activities/[eventId]/signup/page.tsx`, `src/app/(app)/settings/difficulties/page.tsx`
- Test: `tests/features/activities/schemas.test.ts`, `tests/features/activities/repository.test.ts`

**Interfaces:** `createRaidEvent({groupId,title,eventDate,gameWeek,waves})`, `listActivities(groupId)`, `getSignup(eventId,profileId)`, `setRegistration(formData)` and `updateDifficultyPreset` all derive authority from current space.

- [ ] Write failing schema/repository tests for 1..N waves, normal/hard/judgment, admin-only creation and same-space character registration.
- [ ] Implement real activity/difficulty queries and secure actions.
- [ ] Replace demo screens with activity creation, activity list, registration and difficulty forms; hide management operations from ordinary members.
- [ ] Verify feature tests, typecheck and lint; commit.

### Task 4: 排表工作台、手动调整与发布

**Files:**
- Create: `src/features/schedule-workbench/repository.ts`, `src/features/schedule-workbench/schedule-workbench.tsx`, `src/features/schedule-workbench/team-board.tsx`, `src/features/schedule-workbench/candidate-pool.tsx`, `src/app/(app)/activities/[eventId]/schedule/page.tsx`
- Modify: `src/features/schedule-workbench/actions.ts`, `supabase/migrations/202608190007_schedule_workbench_functions.sql`, `src/lib/database.types.ts`
- Test: `tests/features/schedule-workbench/repository.test.ts`, `tests/components/schedule-workbench.test.tsx`, `tests/database/schedule-workbench-functions.test.ts`

**Interfaces:** `getScheduleWorkbench(eventId)`, `generateAndPersistSchedule(eventId)`, `replaceScheduleSnapshot(...)`, `setMemberAttendance(...)` and `publishSchedule(eventId)` return discriminated success/conflict/validation/forbidden results.

- [ ] Write failing tests for candidate eligibility, locked slots, same-wave account uniqueness, version conflict and publishing validation.
- [ ] Implement transaction functions/repository using existing pure generator and schedule snapshot versioning.
- [ ] Implement click-to-place/swap workbench, candidate filter, lock, mark absent, save draft and publish controls.
- [ ] Verify feature/database tests, typecheck and lint; commit.

### Task 5: 完整流程验证与部署说明

**Files:**
- Create: `tests/e2e/auth-roster-activity.spec.ts`, `tests/e2e/schedule-flow.spec.ts`, `playwright.config.ts`
- Modify: `README.md`, `.env.example`

- [ ] Add deterministic end-to-end coverage for login → space → role → activity → signup → generate → manual save → publish.
- [ ] Document migration application, Vercel variables and bootstrap procedure for `蓝`, without embedding secrets.
- [ ] Run `npm test -- --run`, `npm run lint`, `npm run typecheck`, `npm run build`; manually smoke test production after migration/deploy; commit.
