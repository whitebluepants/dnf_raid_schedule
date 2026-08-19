// @vitest-environment node

import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

const transactionMigration = resolve(
  process.cwd(),
  "supabase/migrations/202608190007_activity_transactions.sql",
);

test("ships an activity transaction migration", () => {
  expect(() => readFileSync(transactionMigration, "utf8")).not.toThrow();
});

const migrations = [
  "202608190001_initial_schema.sql",
  "202608190002_schedule_functions.sql",
  "202608190003_auth_and_spaces.sql",
  "202608190004_space_scoped_characters.sql",
  "202608190005_extensions_schema_compatibility.sql",
  "202608190006_platform_admin_and_active_space.sql",
  "202608190007_activity_transactions.sql",
  "202608190013_event_wave_planning_and_difficulty_defaults.sql",
].map((name) => resolve(process.cwd(), "supabase/migrations", name));
const containerName = `dnf-activities-${process.pid}-${randomUUID().slice(0, 8)}`;
const integration = spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0 ? describe : describe.skip;

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

integration("enforces active own current-space characters at registration boundary", () => {
  const owner = randomUUID();
  const other = randomUUID();
  const group = randomUUID();
  const otherGroup = randomUUID();
  const event = randomUUID();
  const activeAccount = randomUUID();
  const activeCharacter = randomUUID();
  const archivedAccount = randomUUID();
  const archivedCharacter = randomUUID();
  const otherAccount = randomUUID();
  const otherCharacter = randomUUID();
  const memberAccount = randomUUID();
  const memberCharacter = randomUUID();

  beforeAll(() => {
    execFileSync("docker", ["run", "--detach", "--rm", "--name", containerName, "--env", "POSTGRES_PASSWORD=postgres", "postgres:17-alpine", "-c", "fsync=off"], { stdio: "ignore" });
    let ready = false;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const logs = spawnSync("docker", ["logs", containerName], { encoding: "utf8" });
      const readyMarkers = `${logs.stdout}${logs.stderr}`.match(/database system is ready to accept connections/g)?.length ?? 0;
      if (spawnSync("docker", ["exec", containerName, "psql", "-U", "postgres", "-d", "postgres", "-Atqc", "select 1"], { stdio: "ignore" }).status === 0 && readyMarkers >= 2) {
        ready = true;
        break;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    }
    expect(ready).toBe(true);
    psql("create role authenticated nologin; create role anon nologin; create schema auth; create schema extensions; create extension pgcrypto with schema extensions; alter database postgres set search_path = public, extensions; create table auth.users (id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;");
    migrations.forEach((migration) => { psql(readFileSync(migration, "utf8")); });
    psql(`
      insert into auth.users (id) values ('${owner}'), ('${other}');
      insert into public.profiles (id, display_name) values ('${owner}', '团员'), ('${other}', '其他团员');
      insert into public.groups (id, name, invite_code_digest, created_by) values ('${group}', '当前空间', 'a', '${owner}'), ('${otherGroup}', '其他空间', 'b', '${owner}');
      insert into public.group_members (group_id, profile_id, role) values ('${group}', '${owner}', 'admin'), ('${group}', '${other}', 'member'), ('${otherGroup}', '${owner}', 'admin');
      insert into public.raid_events (id, group_id, title, game_week, event_date, created_by) values ('${event}', '${group}', '活动', '2026-08-17', '2026-08-22 12:00:00+00', '${owner}');
      insert into public.game_accounts (id, group_id, profile_id, name) values ('${activeAccount}', '${group}', '${owner}', '当前账号'), ('${archivedAccount}', '${group}', '${owner}', '归档账号'), ('${otherAccount}', '${otherGroup}', '${owner}', '其他空间账号'), ('${memberAccount}', '${group}', '${other}', '其他成员账号');
      insert into public.characters (id, game_account_id, group_id, profile_id, name, class_name, role, fame, strength_tier, is_archived) values ('${activeCharacter}', '${activeAccount}', '${group}', '${owner}', '可用角色', '职业', 'dealer', 50000, 'high', false), ('${archivedCharacter}', '${archivedAccount}', '${group}', '${owner}', '归档角色', '职业', 'dealer', 50000, 'high', true), ('${otherCharacter}', '${otherAccount}', '${otherGroup}', '${owner}', '跨空间角色', '职业', 'dealer', 50000, 'high', false), ('${memberCharacter}', '${memberAccount}', '${group}', '${other}', '其他成员角色', '职业', 'dealer', 50000, 'high', false);
    `);
  }, 120_000);

  afterAll(() => { spawnSync("docker", ["rm", "--force", containerName], { stdio: "ignore" }); });

  test("accepts only the active character in the event space and rolls back invalid selections", () => {
    expect(psql(`set role authenticated; set request.jwt.claim.sub = '${owner}'; select public.replace_event_registration('${event}', 'participating', array['${activeCharacter}']::uuid[]);`)).toBe("t");
    expect(psql(`select character_id from public.event_character_registrations where raid_event_id = '${event}';`)).toBe(activeCharacter);
    expect(psqlFailure(`set role authenticated; set request.jwt.claim.sub = '${owner}'; select public.replace_event_registration('${event}', 'participating', array['${archivedCharacter}']::uuid[]);`)).toMatch(/character_forbidden/);
    expect(psqlFailure(`set role authenticated; set request.jwt.claim.sub = '${owner}'; select public.replace_event_registration('${event}', 'participating', array['${otherCharacter}']::uuid[]);`)).toMatch(/character_forbidden/);
    expect(psqlFailure(`set role authenticated; set request.jwt.claim.sub = '${owner}'; select public.replace_event_registration('${event}', 'participating', array['${memberCharacter}']::uuid[]);`)).toMatch(/character_forbidden/);
    expect(psql(`select character_id from public.event_character_registrations where raid_event_id = '${event}';`)).toBe(activeCharacter);
  });

  test("creates an event and all contiguous waves through one transaction boundary", () => {
    expect(psqlFailure(`set role authenticated; set request.jwt.claim.sub = '${owner}'; select public.create_raid_event_with_waves('${group}', '空波次', '2026-08-22 12:00:00+00', '2026-08-17', null);`)).toMatch(/invalid_activity_input/);
    expect(psqlFailure(`set role authenticated; set request.jwt.claim.sub = '${owner}'; select public.create_raid_event_with_waves('${group}', '无效波次', '2026-08-22 12:00:00+00', '2026-08-17', '[{"order":1,"difficulty":"normal"},{"order":3,"difficulty":"hard"}]'::jsonb);`)).toMatch(/invalid_activity_waves/);
    expect(psql(`select count(*) from public.raid_events where title = '无效波次';`)).toBe("0");
    const createdEvent = psql(`set role authenticated; set request.jwt.claim.sub = '${owner}'; select public.create_raid_event_with_waves('${group}', '事务活动', '2026-08-22 12:00:00+00', '2026-08-17', '[{"order":1,"difficulty":"normal"},{"order":2,"difficulty":"hard"}]'::jsonb);`);
    expect(psql(`select string_agg(wave_number || ':' || difficulty::text, ',' order by wave_number) from public.raid_waves where raid_event_id = '${createdEvent}';`)).toBe("1:normal,2:hard");
  });

  test("lets a manager revise an unscheduled event's wave plan and seeds editable difficulty templates", () => {
    expect(psql(`set role authenticated; set request.jwt.claim.sub = '${owner}'; select public.sync_raid_event_waves('${event}', '[{"order":1,"difficulty":"hard"},{"order":2,"difficulty":"normal"},{"order":3,"difficulty":"normal"}]'::jsonb);`)).toBe("t");
    expect(psql(`select string_agg(wave_number || ':' || difficulty::text, ',' order by wave_number) from public.raid_waves where raid_event_id = '${event}';`)).toBe("1:hard,2:normal,3:normal");
    expect(psql("select string_agg(code || ':' || name, ',' order by code) from public.difficulty_presets where group_id is null;")).toBe("normal:普通,hard:困难,judgment:审判");
  });
});
