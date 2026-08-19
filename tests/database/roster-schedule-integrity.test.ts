// @vitest-environment node

import { execFileSync, spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/202608190011_roster_schedule_integrity.sql",
);
const baseMigrationNames = [
  "202608190001_initial_schema.sql",
  "202608190002_schedule_functions.sql",
  "202608190003_auth_and_spaces.sql",
  "202608190004_space_scoped_characters.sql",
  "202608190005_extensions_schema_compatibility.sql",
  "202608190006_platform_admin_and_active_space.sql",
  "202608190007_activity_transactions.sql",
  "202608190008_schedule_workbench_functions.sql",
  "202608190009_registration_schedule_integrity.sql",
  "202608190010_schedule_security_and_terminal_guards.sql",
];
const baseMigrationPaths = baseMigrationNames.map((name) => resolve(process.cwd(), "supabase/migrations", name));
const containerName = `dnf-roster-integrity-${process.pid}-${randomUUID().slice(0, 8)}`;
const emptySnapshot = JSON.stringify(["red", "yellow", "green"].flatMap((teamColor) => [1, 2, 3, 4].map((slotIndex) => ({
  team_color: teamColor,
  slot_index: slotIndex,
  slot_role: slotIndex === 1 ? "buffer" : "dealer",
  character_id: null,
  game_account_id: null,
  profile_id: null,
  is_locked: false,
}))));

function dockerAvailable(): boolean {
  return spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0;
}

function psql(sql: string): string {
  const result = spawnSync("docker", ["exec", "-i", containerName, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-Atq"], { encoding: "utf8", input: sql });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout.trim();
}

function psqlFailure(sql: string): string {
  const result = spawnSync("docker", ["exec", "-i", containerName, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-Atq"], { encoding: "utf8", input: sql });
  expect(result.status).not.toBe(0);
  return `${result.stdout}\n${result.stderr}`;
}

const integration = dockerAvailable() ? describe : describe.skip;

describe("roster schedule integrity migration", () => {
  test("installs a database trigger that protects scheduled characters in their current group", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toMatch(/create or replace function public\.prevent_scheduled_character_mutation/i);
    expect(migration).toMatch(/event\.group_id = old\.group_id/i);
    expect(migration).toMatch(/event\.status in \('draft', 'open', 'published'\)/i);
    expect(migration).toMatch(/raise exception 'scheduled_character_locked'/i);
    expect(migration).toMatch(/before update of is_archived, role, game_account_id/i);
    expect(migration).toMatch(/create or replace function public\.prevent_scheduled_account_mutation/i);
    expect(migration).toMatch(/raise exception 'scheduled_account_locked'/i);
    expect(migration).toMatch(/before update of is_archived, profile_id, group_id/i);
    expect(migration).toMatch(/pg_advisory_xact_lock/i);
    expect(migration).toMatch(/replace_schedule_snapshot_atomic/i);
  });
});

integration("roster schedule integrity", () => {
  const owner = randomUUID();
  const groupId = randomUUID();
  const eventId = randomUUID();
  const waveId = randomUUID();
  const accountId = randomUUID();
  const otherAccountId = randomUUID();
  const characterId = randomUUID();

  beforeAll(() => {
    execFileSync("docker", ["run", "--detach", "--rm", "--name", containerName, "--env", "POSTGRES_PASSWORD=postgres", "postgres:17-alpine", "-c", "fsync=off", "-c", "full_page_writes=off"], { stdio: "ignore" });
    let ready = false;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const result = spawnSync("docker", ["exec", containerName, "psql", "-X", "-U", "postgres", "-d", "postgres", "-Atqc", "select 1"], { stdio: "ignore" });
      const logs = spawnSync("docker", ["logs", containerName], { encoding: "utf8" });
      if (result.status === 0 && (`${logs.stdout}${logs.stderr}`.match(/database system is ready to accept connections/g)?.length ?? 0) >= 2) { ready = true; break; }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
    }
    expect(ready).toBe(true);
    psql("create role authenticated nologin; create role anon nologin; create schema auth; create schema extensions; create extension pgcrypto with schema extensions; alter database postgres set search_path = public, extensions; create table auth.users (id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;");
    for (const path of baseMigrationPaths) psql(readFileSync(path, "utf8"));
    psql(`
      insert into auth.users (id) values ('${owner}');
      insert into public.profiles (id, display_name) values ('${owner}', '角色所有者');
      insert into public.groups (id, name, invite_code_digest, created_by) values ('${groupId}', '团体', '${randomUUID().replaceAll("-", "")}', '${owner}');
      insert into public.group_members (group_id, profile_id, role) values ('${groupId}', '${owner}', 'admin');
      insert into public.raid_events (id, group_id, title, game_week, event_date, status, created_by) values ('${eventId}', '${groupId}', '活动', '2026-08-17', now(), 'published', '${owner}');
      insert into public.raid_waves (id, raid_event_id, wave_number, difficulty, status) values ('${waveId}', '${eventId}', 1, 'hard', 'published');
      insert into public.game_accounts (id, group_id, profile_id, name) values ('${accountId}', '${groupId}', '${owner}', '账号');
      insert into public.game_accounts (id, group_id, profile_id, name) values ('${otherAccountId}', '${groupId}', '${owner}', '备用账号');
      insert into public.characters (id, group_id, game_account_id, profile_id, name, class_name, role, fame, strength_tier, simulated_damage) values ('${characterId}', '${groupId}', '${accountId}', '${owner}', '角色', '剑魂', 'dealer', 70000, 'high', 100);
      insert into public.schedule_slots (raid_wave_id, team_color, slot_index, slot_role, assigned_character_id, assigned_game_account_id, assigned_profile_id) values ('${waveId}', 'red', 2, 'dealer', '${characterId}', '${accountId}', '${owner}');
    `);
    psql(readFileSync(migrationPath, "utf8"));
  }, 120_000);

  afterAll(() => { spawnSync("docker", ["rm", "--force", containerName], { stdio: "ignore" }); });

  test("atomically rejects archive and role edits while the character is scheduled in an active event", () => {
    expect(psqlFailure(`update public.characters set is_archived = true where id = '${characterId}';`)).toMatch(/scheduled_character_locked/);
    expect(psqlFailure(`update public.characters set role = 'buffer' where id = '${characterId}';`)).toMatch(/scheduled_character_locked/);
    expect(psqlFailure(`update public.characters set game_account_id = '${otherAccountId}' where id = '${characterId}';`)).toMatch(/scheduled_character_locked/);
    expect(psqlFailure(`update public.game_accounts set is_archived = true where id = '${accountId}';`)).toMatch(/scheduled_account_locked/);
    expect(psql(`select is_archived || '|' || role from public.characters where id = '${characterId}';`)).toBe("false|dealer");
    expect(psql(`select is_archived from public.game_accounts where id = '${accountId}';`)).toBe("f");
  });

  test("allows the roster change once the event is terminal", () => {
    psql(`update public.raid_events set status = 'completed' where id = '${eventId}'; update public.raid_waves set status = 'completed' where id = '${waveId}'; update public.characters set is_archived = true where id = '${characterId}';`);
    expect(psql(`select is_archived from public.characters where id = '${characterId}';`)).toBe("t");
  });

  test("serializes a schedule snapshot behind the roster group lock", async () => {
    psql(`update public.characters set is_archived = false where id = '${characterId}'; update public.raid_events set status = 'draft' where id = '${eventId}'; update public.raid_waves set status = 'draft' where id = '${waveId}';`);
    const holder = spawn("docker", ["exec", "-i", containerName, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-Atq"], { stdio: ["pipe", "pipe", "pipe"] });
    holder.stdin.end(`begin; select public.lock_roster_schedule_group('${groupId}'); select 'locked'; select pg_sleep(0.75); commit;`);
    await new Promise<void>((resolve, reject) => {
      holder.stdout.on("data", (chunk: Buffer) => { if (chunk.toString().includes("locked")) resolve(); });
      holder.once("error", reject);
    });

    const startedAt = Date.now();
    const result = spawnSync("docker", ["exec", "-i", containerName, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-Atq"], {
      encoding: "utf8",
      input: `begin; set local role authenticated; set local request.jwt.claim.sub = '${owner}'; select public.replace_schedule_snapshot('${eventId}', '${waveId}', 1, '${emptySnapshot}'::jsonb); commit;`,
    });
    const elapsed = Date.now() - startedAt;
    const [exitCode] = await once(holder, "close") as [number];

    expect(exitCode).toBe(0);
    expect(result.status).toBe(0);
    expect(elapsed).toBeGreaterThanOrEqual(500);
  });
});
