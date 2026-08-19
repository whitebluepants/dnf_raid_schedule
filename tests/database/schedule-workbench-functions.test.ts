// @vitest-environment node

import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

const migrationNames = [
  "202608190001_initial_schema.sql",
  "202608190002_schedule_functions.sql",
  "202608190003_auth_and_spaces.sql",
  "202608190004_space_scoped_characters.sql",
  "202608190005_extensions_schema_compatibility.sql",
  "202608190006_platform_admin_and_active_space.sql",
  "202608190007_activity_transactions.sql",
  "202608190008_schedule_workbench_functions.sql",
  "202608190009_registration_schedule_integrity.sql",
];
const migrationPaths = migrationNames.map((name) => resolve(process.cwd(), "supabase/migrations", name));
const migrationPath = migrationPaths.at(-1) ?? "";
const containerName = `dnf-workbench-${process.pid}-${randomUUID().slice(0, 8)}`;
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

function failure(userId: string, sql: string): string {
  const result = spawnSync("docker", ["exec", "-i", containerName, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-Atq"], {
    encoding: "utf8",
    input: `begin; set local role authenticated; set local request.jwt.claim.sub = '${userId}'; ${sql} rollback;`,
  });
  expect(result.status).not.toBe(0);
  return `${result.stdout}\n${result.stderr}`;
}

function authenticated(userId: string, sql: string): string {
  return psql(`begin; set local role authenticated; set local request.jwt.claim.sub = '${userId}'; ${sql} rollback;`);
}

const integration = dockerAvailable() ? describe : describe.skip;

test("the schedule workbench migration exists", () => {
  expect(() => readFileSync(migrationPath, "utf8")).not.toThrow();
});

integration("schedule workbench database functions", () => {
  const platformAdmin = randomUUID();
  const adminA = randomUUID();
  const adminB = randomUUID();
  const member = randomUUID();
  const groupA = randomUUID();
  const groupB = randomUUID();
  const eventA = randomUUID();
  const eventB = randomUUID();
  const waveA = randomUUID();
  const waveB = randomUUID();
  const account = randomUUID();
  const character = randomUUID();
  const extraAccounts = Array.from({ length: 11 }, () => randomUUID());
  const extraCharacters = Array.from({ length: 11 }, () => randomUUID());
  const completeSnapshot = JSON.stringify(["red", "yellow", "green"].flatMap((teamColor, teamIndex) => [1, 2, 3, 4].map((slotIndex) => {
    const position = teamIndex * 4 + slotIndex - 1;
    return {
      team_color: teamColor,
      slot_index: slotIndex,
      slot_role: slotIndex === 1 ? "buffer" : "dealer",
      character_id: position === 1 ? character : extraCharacters[position < 1 ? position : position - 1],
      game_account_id: position === 1 ? account : extraAccounts[position < 1 ? position : position - 1],
      profile_id: member,
      is_locked: false,
    };
  })));

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
    psql(`create role authenticated nologin; create role anon nologin; create schema auth; create schema extensions; create extension pgcrypto with schema extensions; alter database postgres set search_path = public, extensions; create table auth.users (id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;`);
    for (const path of migrationPaths.slice(0, -1)) psql(readFileSync(path, "utf8"));
    psql(`
      insert into auth.users (id) values ('${platformAdmin}'), ('${adminA}'), ('${adminB}'), ('${member}');
      insert into public.profiles (id, display_name, is_platform_admin) values
        ('${platformAdmin}', '平台管理员', true), ('${adminA}', 'A 管理员', false), ('${adminB}', 'B 管理员', false), ('${member}', '报名成员', false);
      insert into public.groups (id, name, invite_code_digest, created_by) values
        ('${groupA}', 'A', '${randomUUID().replaceAll("-", "")}', '${adminA}'), ('${groupB}', 'B', '${randomUUID().replaceAll("-", "")}', '${adminB}');
      insert into public.group_members (group_id, profile_id, role) values
        ('${groupA}', '${adminA}', 'admin'), ('${groupA}', '${member}', 'member'), ('${groupB}', '${adminB}', 'admin');
      insert into public.raid_events (id, group_id, title, game_week, event_date, created_by) values
        ('${eventA}', '${groupA}', 'A 活动', '2026-08-17', now(), '${adminA}'), ('${eventB}', '${groupB}', 'B 活动', '2026-08-17', now(), '${adminB}');
      insert into public.raid_waves (id, raid_event_id, wave_number, difficulty) values
        ('${waveA}', '${eventA}', 1, 'hard'), ('${waveB}', '${eventB}', 1, 'hard');
      insert into public.game_accounts (id, group_id, profile_id, name) values ('${account}', '${groupA}', '${member}', '账号');
      insert into public.characters (id, group_id, game_account_id, profile_id, name, class_name, role, fame, strength_tier, simulated_damage) values
        ('${character}', '${groupA}', '${account}', '${member}', '角色', '剑魂', 'dealer', 70000, 'high', 100);
      insert into public.event_registrations (raid_event_id, profile_id, state) values ('${eventA}', '${member}', 'participating');
      insert into public.event_character_registrations (raid_event_id, profile_id, character_id) values ('${eventA}', '${member}', '${character}');
      insert into public.game_accounts (id, group_id, profile_id, name) values
        ${extraAccounts.map((id, index) => `('${id}', '${groupA}', '${member}', '账号${index + 2}')`).join(",")};
      insert into public.characters (id, group_id, game_account_id, profile_id, name, class_name, role, fame, strength_tier, simulated_damage, buffer_power) values
        ${extraCharacters.map((id, index) => `('${id}', '${groupA}', '${extraAccounts[index]}', '${member}', '角色${index + 2}', '职业${index + 2}', '${[0, 3, 7].includes(index) ? "buffer" : "dealer"}', 70000, 'high', ${[0, 3, 7].includes(index) ? "null" : "100"}, ${[0, 3, 7].includes(index) ? "100" : "null"})`).join(",")};
      insert into public.event_character_registrations (raid_event_id, profile_id, character_id) values
        ${extraCharacters.map((id) => `('${eventA}', '${member}', '${id}')`).join(",")};
    `);
    psql(readFileSync(migrationPath, "utf8"));
  }, 120_000);

  afterAll(() => { spawnSync("docker", ["rm", "--force", containerName], { stdio: "ignore" }); });

  test("rejects a stale snapshot and an admin from another space", () => {
    expect(failure(adminA, `select public.replace_schedule_snapshot('${eventA}', '${waveA}', 99, '[]'::jsonb);`)).toMatch(/schedule_version_conflict/);
    expect(failure(adminA, `select public.replace_schedule_snapshot('${eventB}', '${waveB}', 1, '[]'::jsonb);`)).toMatch(/schedule_forbidden/);
  });

  test("accepts a platform administrator through the secure role check", () => {
    expect(authenticated(platformAdmin, `select public.replace_schedule_snapshot('${eventA}', '${waveA}', 1, '${emptySnapshot}'::jsonb);`)).toBe("2");
    expect(authenticated(platformAdmin, `select public.replace_event_schedule_snapshots('${eventA}', jsonb_build_object('${waveA}', 1), jsonb_build_object('${waveA}', '${emptySnapshot}'::jsonb));`)).toBe(`{"${waveA}": 2}`);
  });

  test("refuses to publish an incomplete schedule", () => {
    expect(failure(adminA, `select public.publish_schedule('${eventA}', jsonb_build_object('${waveA}', 1));`)).toMatch(/schedule_incomplete/);
  });

  test("lets a member mark their own signup absent and atomically releases their reserved slot", () => {
    const assignedSnapshot = JSON.stringify(JSON.parse(emptySnapshot).map((slot: Record<string, unknown>) =>
      slot.team_color === "red" && slot.slot_index === 2
        ? { ...slot, character_id: character, game_account_id: account, profile_id: member }
        : slot,
    ));
    const output = psql(`
      begin;
      set local role authenticated;
      set local request.jwt.claim.sub = '${adminA}';
      select public.replace_schedule_snapshot('${eventA}', '${waveA}', 1, '${assignedSnapshot}'::jsonb);
      set local request.jwt.claim.sub = '${member}';
      select public.set_schedule_member_attendance('${eventA}', '${member}', 'absent');
      select registration.state || '|' || (slot.assigned_character_id is null)::text || '|' || wave.version
      from public.event_registrations registration
      join public.raid_waves wave on wave.raid_event_id = registration.raid_event_id
      join public.schedule_slots slot on slot.raid_wave_id = wave.id and slot.team_color = 'red' and slot.slot_index = 2
      where registration.raid_event_id = '${eventA}' and registration.profile_id = '${member}';
      rollback;
    `);

    expect(output).toBe("2\nt\nabsent|true|3");
  });

  test("revalidates attendance at publish even when registration changed outside the workbench RPC", () => {
    expect(failure(adminA, `
      select public.replace_schedule_snapshot('${eventA}', '${waveA}', 1, '${completeSnapshot}'::jsonb);
      update public.event_registrations set state = 'absent' where raid_event_id = '${eventA}' and profile_id = '${member}';
      select public.publish_schedule('${eventA}', jsonb_build_object('${waveA}', 2));
    `)).toMatch(/schedule_registration_invalid/);
  });

  test("publishing increments versions so the pre-publish draft can never be saved", () => {
    expect(authenticated(adminA, `
      select public.replace_schedule_snapshot('${eventA}', '${waveA}', 1, '${completeSnapshot}'::jsonb);
      select public.publish_schedule('${eventA}', jsonb_build_object('${waveA}', 2));
      select version from public.raid_waves where id = '${waveA}';
    `)).toBe("2\nt\n3");
    expect(failure(adminA, `
      select public.replace_schedule_snapshot('${eventA}', '${waveA}', 1, '${completeSnapshot}'::jsonb);
      select public.publish_schedule('${eventA}', jsonb_build_object('${waveA}', 2));
      select public.replace_schedule_snapshot('${eventA}', '${waveA}', 2, '${completeSnapshot}'::jsonb);
    `)).toMatch(/schedule_version_conflict/);
  });

  test.each(["completed", "archived"] as const)("rejects registration changes for a %s event without mutating schedule history", (status) => {
    const output = authenticated(adminA, `
      select public.replace_schedule_snapshot('${eventA}', '${waveA}', 1, '${completeSnapshot}'::jsonb);
      update public.raid_events set status = '${status}' where id = '${eventA}';
      update public.raid_waves set status = '${status}' where id = '${waveA}';
      set local request.jwt.claim.sub = '${member}';
      do $registration$
      begin
        begin
          perform public.replace_event_registration('${eventA}', 'participating', array['${extraCharacters[1]}']::uuid[]);
          raise exception 'registration_change_was_accepted';
        exception when others then
          if sqlerrm <> 'registration_closed' then raise; end if;
        end;
      end
      $registration$;
      select registration.state || '|' ||
        (select count(*) from public.event_character_registrations selected where selected.raid_event_id = registration.raid_event_id) || '|' ||
        (select count(*) from public.schedule_slots slot where slot.raid_wave_id = '${waveA}' and slot.assigned_character_id is not null) || '|' ||
        (select count(*) from public.character_weekly_usage usage where usage.raid_wave_id = '${waveA}') || '|' ||
        wave.version || '|' ||
        (select count(*) from public.schedule_revisions revision where revision.raid_wave_id = wave.id)
      from public.event_registrations registration
      join public.raid_waves wave on wave.raid_event_id = registration.raid_event_id
      where registration.raid_event_id = '${eventA}' and registration.profile_id = '${member}';
    `);

    expect(output).toBe("2\nparticipating|12|12|12|2|1");
  });

  test.each(["completed", "archived"] as const)("rejects registration changes that would rewrite a %s wave", (status) => {
    const output = authenticated(adminA, `
      select public.replace_schedule_snapshot('${eventA}', '${waveA}', 1, '${completeSnapshot}'::jsonb);
      update public.raid_events set status = 'open' where id = '${eventA}';
      update public.raid_waves set status = '${status}' where id = '${waveA}';
      set local request.jwt.claim.sub = '${member}';
      do $registration$
      begin
        begin
          perform public.replace_event_registration('${eventA}', 'participating', array['${extraCharacters[1]}']::uuid[]);
          raise exception 'registration_change_was_accepted';
        exception when others then
          if sqlerrm <> 'registration_closed' then raise; end if;
        end;
      end
      $registration$;
      select registration.state || '|' ||
        (select count(*) from public.event_character_registrations selected where selected.raid_event_id = registration.raid_event_id) || '|' ||
        (select count(*) from public.schedule_slots slot where slot.raid_wave_id = '${waveA}' and slot.assigned_character_id is not null) || '|' ||
        (select count(*) from public.character_weekly_usage usage where usage.raid_wave_id = '${waveA}') || '|' ||
        wave.version || '|' || wave.status || '|' ||
        (select count(*) from public.schedule_revisions revision where revision.raid_wave_id = wave.id)
      from public.event_registrations registration
      join public.raid_waves wave on wave.raid_event_id = registration.raid_event_id
      where registration.raid_event_id = '${eventA}' and registration.profile_id = '${member}';
    `);

    expect(output).toBe(`2\nparticipating|12|12|12|2|${status}|1`);
  });

  test("the legacy registration RPC clears reservations and slots when marking absent", () => {
    const output = authenticated(adminA, `
      select public.replace_schedule_snapshot('${eventA}', '${waveA}', 1, '${completeSnapshot}'::jsonb);
      set local request.jwt.claim.sub = '${member}';
      select public.replace_event_registration('${eventA}', 'absent', array[]::uuid[]);
      select registration.state || '|' || count(slot.assigned_character_id) || '|' || count(usage.id)
      from public.event_registrations registration
      left join public.schedule_slots slot on slot.raid_wave_id = '${waveA}' and slot.assigned_profile_id = '${member}'
      left join public.character_weekly_usage usage on usage.raid_wave_id = '${waveA}'
      where registration.raid_event_id = '${eventA}' and registration.profile_id = '${member}'
      group by registration.state;
    `);
    expect(output).toBe("2\nt\nabsent|0|0");
  });

  test("changing a participating registration clears every scheduled character that was unselected", () => {
    const keptCharacter = extraCharacters[1];
    const output = authenticated(adminA, `
      select public.replace_schedule_snapshot('${eventA}', '${waveA}', 1, '${completeSnapshot}'::jsonb);
      select public.publish_schedule('${eventA}', jsonb_build_object('${waveA}', 2));
      set local request.jwt.claim.sub = '${member}';
      select public.replace_event_registration('${eventA}', 'participating', array['${keptCharacter}']::uuid[]);
      select wave.version || '|' || event.status || '|' ||
        (select count(*) from public.schedule_slots slot where slot.raid_wave_id = wave.id and slot.assigned_character_id is not null) || '|' ||
        (select count(*) from public.character_weekly_usage usage where usage.raid_wave_id = wave.id) || '|' ||
        (select count(*) from public.schedule_revisions revision where revision.raid_wave_id = wave.id and revision.action = 'replace')
      from public.raid_waves wave
      join public.raid_events event on event.id = wave.raid_event_id
      where wave.id = '${waveA}';
    `);

    expect(output).toBe("2\nt\nt\n4|draft|1|1|2");
  });
});
