import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/202608190001_initial_schema.sql",
);
const scheduleMigrationPath = resolve(
  process.cwd(),
  "supabase/migrations/202608190002_schedule_functions.sql",
);
const authSpacesMigrationPath = resolve(
  process.cwd(),
  "supabase/migrations/202608190003_auth_and_spaces.sql",
);
const seedPath = resolve(process.cwd(), "supabase/seed.sql");
const containerName = `dnf-schema-test-${process.pid}-${randomUUID().slice(0, 8)}`;

function dockerAvailable(): boolean {
  return spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0;
}

function psql(sql: string): string {
  const result = spawnSync(
    "docker",
    [
      "exec",
      "-i",
      containerName,
      "psql",
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-Atq",
    ],
    { encoding: "utf8", input: sql },
  );

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout);
  }

  return result.stdout.trim();
}

function psqlFailure(sql: string): string {
  const result = spawnSync(
    "docker",
    [
      "exec",
      "-i",
      containerName,
      "psql",
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-Atq",
    ],
    { encoding: "utf8", input: sql },
  );

  expect(result.status).not.toBe(0);
  return `${result.stdout}\n${result.stderr}`;
}

function asAuthenticated(userId: string, sql: string): string {
  return psql(`
    begin;
    set local role authenticated;
    set local request.jwt.claim.sub = '${userId}';
    ${sql}
    rollback;
  `);
}

const hasDocker = dockerAvailable();
const integration = hasDocker ? describe : describe.skip;

test("the versioned initial migration exists", () => {
  expect(() => readFileSync(migrationPath, "utf8")).not.toThrow();
});

test("keeps schedule writes behind the future transactional boundary", () => {
  const migration = readFileSync(migrationPath, "utf8");

  expect(migration).toMatch(
    /create policy schedule_slots_select_members[\s\S]*create policy character_weekly_usage_select_members/,
  );
  expect(migration).not.toMatch(/create policy schedule_slots_leader_manage/);
  expect(migration).not.toMatch(/create policy schedule_revisions_leader_manage/);
  expect(migration).toMatch(
    /constraint schedule_revisions_wave_event_fk[\s\S]*foreign key \(raid_wave_id, raid_event_id\)/,
  );
  expect(migration).not.toMatch(/create policy groups_admin_insert/);
  expect(migration).not.toMatch(/create policy groups_admin_manage/);
});

test("migration source contains the complete persistence contract", () => {
  const migration = readFileSync(migrationPath, "utf8");
  for (const declaration of [
    "create type public.member_role",
    "create type public.character_role",
    "create type public.difficulty_code",
    "create table public.profiles",
    "create table public.groups",
    "create table public.group_members",
    "create table public.game_accounts",
    "create table public.characters",
    "create table public.raid_events",
    "create table public.raid_waves",
    "create table public.event_registrations",
    "create table public.event_character_registrations",
    "create table public.schedule_slots",
    "create table public.character_weekly_usage",
    "create table public.schedule_revisions",
    "alter table public.profiles enable row level security",
    "alter table public.schedule_slots enable row level security",
    "grant select, insert, update, delete on all tables in schema public to authenticated",
  ]) {
    expect(migration.toLowerCase()).toContain(declaration);
  }
});

test("schedule migration source contains authenticated transactional boundaries", () => {
  const migration = readFileSync(scheduleMigrationPath, "utf8");
  expect(migration).toMatch(/create or replace function public\.replace_schedule_snapshot/);
  expect(migration).toMatch(/schedule_version_conflict/);
  expect(migration).toMatch(/character_weekly_conflict/);
  expect(migration).toMatch(/create or replace function public\.create_group/);
  expect(migration).toMatch(/create or replace function public\.join_group_by_invite/);
  expect(migration).toMatch(/grant execute on function public\.replace_schedule_snapshot/);
  expect(migration).toMatch(/create or replace function public\.replace_event_registration/);
});

integration("initial Supabase migration", () => {
  beforeAll(() => {
    execFileSync(
      "docker",
      [
        "run",
        "--detach",
        "--rm",
        "--name",
        containerName,
        "--env",
        "POSTGRES_PASSWORD=postgres",
        "postgres:17-alpine",
        "-c",
        "fsync=off",
        "-c",
        "full_page_writes=off",
      ],
      { stdio: "ignore" },
    );

    let ready = false;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const result = spawnSync(
        "docker",
        [
          "exec",
          containerName,
          "psql",
          "-X",
          "-U",
          "postgres",
          "-d",
          "postgres",
          "-Atqc",
          "select 1",
        ],
        { stdio: "ignore" },
      );
      const logs = spawnSync("docker", ["logs", containerName], {
        encoding: "utf8",
      });
      const readyMarkerCount =
        `${logs.stdout}${logs.stderr}`.match(
          /database system is ready to accept connections/g,
        )?.length ?? 0;
      if (result.status === 0 && readyMarkerCount >= 2) {
        ready = true;
        break;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
    }
    expect(ready).toBe(true);

    psql(`
      create role authenticated nologin;
      create role anon nologin;
      create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid
      language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    `);
    psql(readFileSync(migrationPath, "utf8"));
    psql(readFileSync(scheduleMigrationPath, "utf8"));
    psql(readFileSync(authSpacesMigrationPath, "utf8"));
  }, 120_000);

  afterAll(() => {
    spawnSync("docker", ["rm", "--force", containerName], { stdio: "ignore" });
  });

  test("creates every domain enum with the specified values", () => {
    const rows = psql(`
      select t.typname || '=' || string_agg(e.enumlabel, ',' order by e.enumsortorder)
      from pg_type t
      join pg_enum e on e.enumtypid = t.oid
      join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'public'
      group by t.typname
      order by t.typname;
    `).split("\n");

    expect(rows).toEqual([
      "character_role=dealer,buffer",
      "difficulty_code=normal,hard,judgment",
      "event_state=draft,open,published,completed,archived",
      "member_role=member,leader,admin",
      "registration_state=participating,absent",
      "revision_action=generate,move,swap,replace,mark_absent,publish,undo,redo,lock,unlock",
      "strength_tier=high,medium,low",
      "team_color=red,yellow,green",
      "usage_state=reserved,completed",
    ]);
  });

  test("lets a signed-in profile create a space with a shareable invite code", () => {
    const profileId = randomUUID();
    const groupId = psql(
      `
        insert into auth.users (id) values ('${profileId}');
        insert into public.profiles (id, display_name)
        values ('${profileId}', '团长');
        set role authenticated;
        set request.jwt.claim.sub = '${profileId}';
        select public.create_group('固定团', 'TEAM2026');
      `,
    );
    const space = psql(
      `
        select groups.name || '|' || groups.invite_code || '|' || group_members.role
        from public.groups
        join public.group_members on group_members.group_id = groups.id
        where groups.id = '${groupId}' and group_members.profile_id = '${profileId}';
      `,
    );

    expect(space).toBe("固定团|TEAM2026|admin");
  });

  test("creates every persisted table and enables row level security", () => {
    const rows = psql(`
      select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
      order by c.relname;
    `).split("\n");

    expect(rows).toEqual([
      "character_weekly_usage",
      "characters",
      "difficulty_presets",
      "event_character_registrations",
      "event_registrations",
      "game_accounts",
      "group_members",
      "groups",
      "profiles",
      "raid_events",
      "raid_waves",
      "schedule_revisions",
      "schedule_slots",
    ]);
  });

  test("installs ownership foreign keys, checks, indexes, and updated-at triggers", () => {
    const foreignKeys = psql(`
      select conrelid::regclass::text || ':' || pg_get_constraintdef(oid)
      from pg_constraint
      where contype = 'f' and connamespace = 'public'::regnamespace
      order by conrelid::regclass::text, conname;
    `);
    expect(foreignKeys).toContain(
      "profiles:FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE",
    );
    expect(foreignKeys).toContain(
      "characters:FOREIGN KEY (game_account_id, profile_id) REFERENCES game_accounts(id, profile_id)",
    );
    expect(foreignKeys).toContain(
      "event_character_registrations:FOREIGN KEY (raid_event_id, profile_id) REFERENCES event_registrations(raid_event_id, profile_id) ON DELETE CASCADE",
    );

    const checks = psql(`
      select conrelid::regclass::text || ':' || pg_get_constraintdef(oid)
      from pg_constraint
      where contype = 'c' and connamespace = 'public'::regnamespace
      order by conrelid::regclass::text, conname;
    `);
    expect(checks).toMatch(/characters:CHECK \(\(fame > 0\)\)/);
    expect(checks).toMatch(
      /simulated_damage IS NULL[\s\S]*simulated_damage > \(0\)::numeric/,
    );
    expect(checks).toMatch(/buffer_power IS NULL[\s\S]*buffer_power > \(0\)::numeric/);

    const indexes = psql(`
      select indexdef from pg_indexes
      where schemaname = 'public'
      order by indexname;
    `);
    expect(indexes).toMatch(
      /UNIQUE INDEX event_registrations_event_profile_key .* \(raid_event_id, profile_id\)/,
    );
    expect(indexes).toMatch(
      /UNIQUE INDEX event_character_registrations_event_character_key .* \(raid_event_id, character_id\)/,
    );
    expect(indexes).toMatch(
      /UNIQUE INDEX schedule_slots_wave_team_slot_key .* \(raid_wave_id, team_color, slot_index\)/,
    );
    expect(indexes).toMatch(
      /UNIQUE INDEX character_weekly_usage_week_character_key .* \(game_week, character_id\)/,
    );
    expect(indexes).toMatch(/raid_events_group_schedule_idx/);
    expect(indexes).toMatch(/schedule_slots_wave_assignment_idx/);

    const triggers = psql(`
      select event_object_table
      from information_schema.triggers
      where trigger_schema = 'public' and trigger_name like 'set_%_updated_at'
      order by event_object_table;
    `).split("\n");
    expect(triggers).toEqual([
      "characters",
      "difficulty_presets",
      "event_registrations",
      "game_accounts",
      "group_members",
      "groups",
      "profiles",
      "raid_events",
      "raid_waves",
      "schedule_slots",
    ]);
  });

  test("installs non-recursive membership helpers with pinned search paths", () => {
    const helpers = psql(`
      select p.proname || '|' || p.prosecdef || '|' || coalesce(array_to_string(p.proconfig, ','), '')
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in ('current_profile_id', 'is_group_member', 'has_group_role')
      order by p.proname;
    `).split("\n");

    expect(helpers).toEqual([
      "current_profile_id|true|search_path=public, auth",
      "has_group_role|true|search_path=public, auth",
      "is_group_member|true|search_path=public, auth",
    ]);
  });

  test("declares policies for each required read and write boundary", () => {
    const policies = psql(`
      select tablename || '|' || cmd || '|' || policyname
      from pg_policies
      where schemaname = 'public'
      order by tablename, cmd, policyname;
    `);

    for (const contract of [
      "profiles|SELECT|profiles_select_self_or_peer",
      "profiles|UPDATE|profiles_update_self",
      "game_accounts|SELECT|game_accounts_select_group",
      "game_accounts|INSERT|game_accounts_owner_insert",
      "game_accounts|UPDATE|game_accounts_owner_update",
      "characters|SELECT|characters_select_group",
      "characters|INSERT|characters_owner_insert",
      "characters|UPDATE|characters_owner_update",
      "groups|SELECT|groups_select_members",
      "groups|UPDATE|groups_admin_update",
      "group_members|SELECT|group_members_select_members",
      "group_members|ALL|group_members_admin_manage",
      "difficulty_presets|SELECT|difficulty_presets_select_members",
      "difficulty_presets|ALL|difficulty_presets_admin_manage",
      "raid_events|SELECT|raid_events_select_members",
      "raid_events|INSERT|raid_events_leader_insert",
      "raid_events|UPDATE|raid_events_leader_update",
      "event_registrations|ALL|event_registrations_self_write",
      "event_registrations|ALL|event_registrations_leader_manage",
      "event_character_registrations|ALL|event_character_registrations_self_write",
      "event_character_registrations|ALL|event_character_registrations_leader_manage",
      "character_weekly_usage|SELECT|character_weekly_usage_select_members",
      "schedule_revisions|SELECT|schedule_revisions_select_members",
    ]) {
      expect(policies).toContain(contract);
    }

    expect(policies).not.toMatch(/character_weekly_usage\|(INSERT|UPDATE|DELETE|ALL)\|/);
  });

  test("enforces unique registration, slot, and weekly usage identities", () => {
    psql(seedFixtures);

    expect(
      psqlFailure(`
        insert into event_registrations (raid_event_id, profile_id, state)
        values ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000001', 'participating');
      `),
    ).toMatch(/event_registrations_event_profile_key/);

    expect(
      psqlFailure(`
        insert into event_character_registrations (raid_event_id, profile_id, character_id)
        values ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000301');
      `),
    ).toMatch(/event_character_registrations_event_character_key/);

    expect(
      psqlFailure(`
        insert into schedule_slots (raid_wave_id, team_color, slot_index, slot_role)
        values ('00000000-0000-0000-0000-000000000501', 'red', 1, 'buffer');
      `),
    ).toMatch(/schedule_slots_wave_team_slot_key/);

    expect(
      psqlFailure(`
        insert into character_weekly_usage (game_week, character_id, raid_event_id, raid_wave_id, state, reserved_by)
        values ('2026-08-17', '00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000501', 'reserved', '00000000-0000-0000-0000-000000000002');
      `),
    ).toMatch(/character_weekly_usage_week_character_key/);
  });

  test("allows peer reads, limits owner writes, and reserves schedule writes for RPCs", () => {
    const user = "00000000-0000-0000-0000-000000000001";
    const admin = "00000000-0000-0000-0000-000000000002";
    const outsider = "00000000-0000-0000-0000-000000000003";

    expect(
      asAuthenticated(
        user,
        "select string_agg(display_name, ',' order by display_name) from profiles;",
      ),
    ).toBe("Alice,Amy");
    expect(
      asAuthenticated(
        outsider,
        "select string_agg(display_name, ',' order by display_name) from profiles;",
      ),
    ).toBe("Oscar");
    expect(
      asAuthenticated(
        admin,
        "select name from game_accounts where id = '00000000-0000-0000-0000-000000000201';",
      ),
    ).toBe("Alice account");
    expect(
      asAuthenticated(
        admin,
        "update game_accounts set name = 'forbidden' where id = '00000000-0000-0000-0000-000000000201' returning name;",
      ),
    ).toBe("");
    expect(
      asAuthenticated(
        user,
        "update raid_events set title = 'forbidden' where id = '00000000-0000-0000-0000-000000000401' returning title;",
      ),
    ).toBe("");
    expect(
      asAuthenticated(
        admin,
        "update raid_events set title = 'allowed' where id = '00000000-0000-0000-0000-000000000401' returning title;",
      ),
    ).toBe("allowed");

    expect(
      psqlFailure(`
        begin;
        set local role authenticated;
        set local request.jwt.claim.sub = '${admin}';
        insert into schedule_slots (raid_wave_id, team_color, slot_index, slot_role)
        values ('00000000-0000-0000-0000-000000000501', 'yellow', 1, 'dealer');
        rollback;
      `),
    ).toMatch(/row-level security policy/);

    expect(
      psqlFailure(`
        begin;
        set local role authenticated;
        set local request.jwt.claim.sub = '${admin}';
        insert into schedule_revisions (raid_event_id, raid_wave_id, action, actor_profile_id)
        values ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000501', 'generate', '${admin}');
        rollback;
      `),
    ).toMatch(/row-level security policy/);
  });

  test("rejects leader writes that target profiles outside the event group", () => {
    const admin = "00000000-0000-0000-0000-000000000002";
    psql(seedFixtures);
    expect(
      psqlFailure(`
        begin;
        set local role authenticated;
        set local request.jwt.claim.sub = '${admin}';
        insert into event_registrations (raid_event_id, profile_id)
        values ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000003');
        rollback;
      `),
    ).toMatch(/row-level security policy/);
  });

  test("permits self registration but blocks direct weekly-usage writes", () => {
    const user = "00000000-0000-0000-0000-000000000001";
    const admin = "00000000-0000-0000-0000-000000000002";

    expect(
      asAuthenticated(
        user,
        `insert into event_registrations (raid_event_id, profile_id, state)
         values ('00000000-0000-0000-0000-000000000401', '${user}', 'participating')
         on conflict (raid_event_id, profile_id) do update set state = excluded.state
         returning state;`,
      ),
    ).toBe("participating");

    const denied = psqlFailure(`
      begin;
      set local role authenticated;
      set local request.jwt.claim.sub = '${admin}';
      insert into character_weekly_usage (game_week, character_id, raid_event_id, raid_wave_id, state, reserved_by)
      values ('2026-08-24', '00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000501', 'reserved', '${admin}');
      rollback;
    `);
    expect(denied).toMatch(/row-level security policy/);
  });

  test("seeds named presets with every numeric threshold disabled", () => {
    psql(readFileSync(seedPath, "utf8"));
    const presets = psql(`
      select code || '|' || name || '|' || auto_assignment_enabled || '|' ||
        concat_ws(',', minimum_fame, red_dealer_fame, yellow_dealer_fame,
          green_dealer_fame, red_buffer_power, yellow_buffer_power,
          green_buffer_power, simulated_damage_reference)
      from difficulty_presets
      where group_id is null
      order by code::text;
    `).split("\n");

    expect(presets).toEqual([
      "hard|困难|false|",
      "judgment|审判|false|",
      "normal|普通|false|",
    ]);
  });
});

const seedFixtures = `
  insert into auth.users (id) values
    ('00000000-0000-0000-0000-000000000001'),
    ('00000000-0000-0000-0000-000000000002'),
    ('00000000-0000-0000-0000-000000000003')
  on conflict do nothing;
  insert into profiles (id, display_name) values
    ('00000000-0000-0000-0000-000000000001', 'Alice'),
    ('00000000-0000-0000-0000-000000000002', 'Amy'),
    ('00000000-0000-0000-0000-000000000003', 'Oscar')
  on conflict do nothing;
  insert into groups (id, name, invite_code_digest, created_by) values
    ('00000000-0000-0000-0000-000000000101', 'Raid group', 'digest', '00000000-0000-0000-0000-000000000002')
  on conflict do nothing;
  insert into group_members (group_id, profile_id, role) values
    ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000001', 'member'),
    ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000002', 'admin')
  on conflict do nothing;
  insert into game_accounts (id, profile_id, name) values
    ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000001', 'Alice account'),
    ('00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000003', 'Oscar account')
  on conflict do nothing;
  insert into characters (id, game_account_id, profile_id, name, class_name, role, fame, strength_tier) values
    ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000001', 'Alice dealer', 'Class', 'dealer', 50000, 'high')
  on conflict do nothing;
  insert into raid_events (id, group_id, title, game_week, event_date, status, created_by) values
    ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000101', 'Weekly raid', '2026-08-17', '2026-08-22 12:00:00+00', 'open', '00000000-0000-0000-0000-000000000002')
  on conflict do nothing;
  insert into raid_waves (id, raid_event_id, wave_number, difficulty, status) values
    ('00000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000401', 1, 'normal', 'draft')
  on conflict do nothing;
  insert into event_registrations (raid_event_id, profile_id, state) values
    ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000001', 'participating')
  on conflict do nothing;
  insert into event_character_registrations (raid_event_id, profile_id, character_id) values
    ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000301')
  on conflict do nothing;
  insert into schedule_slots (raid_wave_id, team_color, slot_index, slot_role) values
    ('00000000-0000-0000-0000-000000000501', 'red', 1, 'buffer')
  on conflict do nothing;
  insert into character_weekly_usage (game_week, character_id, raid_event_id, raid_wave_id, state, reserved_by) values
    ('2026-08-17', '00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000501', 'reserved', '00000000-0000-0000-0000-000000000002')
  on conflict do nothing;
`;
