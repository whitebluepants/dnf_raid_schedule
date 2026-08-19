// @vitest-environment node

import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

const migrationPaths = [
  "202608190001_initial_schema.sql",
  "202608190002_schedule_functions.sql",
  "202608190003_auth_and_spaces.sql",
  "202608190004_space_scoped_characters.sql",
  "202608190005_extensions_schema_compatibility.sql",
  "202608190006_platform_admin_and_active_space.sql",
].map((name) => resolve(process.cwd(), "supabase/migrations", name));
const platformAdminMigrationPath = resolve(
  process.cwd(),
  "supabase/migrations/202608190006_platform_admin_and_active_space.sql",
);

const containerName = `dnf-platform-admin-${process.pid}-${randomUUID().slice(0, 8)}`;

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
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
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

function authenticated(userId: string, sql: string): string {
  return psql(`
    begin;
    set local role authenticated;
    set local request.jwt.claim.sub = '${userId}';
    ${sql}
    rollback;
  `);
}

function authenticatedCommit(userId: string, sql: string): string {
  return psql(`
    set role authenticated;
    set request.jwt.claim.sub = '${userId}';
    ${sql}
  `);
}

const integration = dockerAvailable() ? describe : describe.skip;

test("the platform-admin migration exists", () => {
  expect(() => readFileSync(platformAdminMigrationPath, "utf8")).not.toThrow();
});

integration("platform admin and active-space migration", () => {
  const blueId = randomUUID();
  const adminA = randomUUID();
  const memberA = randomUUID();
  const adminB = randomUUID();
  const memberB = randomUUID();
  let groupA = "";
  let groupB = "";

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
        ["exec", containerName, "psql", "-X", "-U", "postgres", "-d", "postgres", "-Atqc", "select 1"],
        { stdio: "ignore" },
      );
      const logs = spawnSync("docker", ["logs", containerName], { encoding: "utf8" });
      const readyMarkers = `${logs.stdout}${logs.stderr}`.match(
        /database system is ready to accept connections/g,
      )?.length;
      if (result.status === 0 && (readyMarkers ?? 0) >= 2) {
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
      create schema extensions;
      create extension pgcrypto with schema extensions;
      alter database postgres set search_path = public, extensions;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    `);
    for (const migrationPath of migrationPaths.slice(0, -1)) {
      psql(readFileSync(migrationPath, "utf8"));
    }
    psql(`
      insert into auth.users (id) values
        ('${blueId}'), ('${adminA}'), ('${memberA}'), ('${adminB}'), ('${memberB}');
      insert into public.profiles (id, display_name) values
        ('${blueId}', '蓝'), ('${adminA}', 'A 管理员'), ('${memberA}', 'A 成员'),
        ('${adminB}', 'B 管理员'), ('${memberB}', 'B 成员');
    `);
    psql(readFileSync(platformAdminMigrationPath, "utf8"));

    groupA = authenticatedCommit(adminA, "select group_id from public.create_group('A 空间');");
    groupB = authenticatedCommit(adminB, "select group_id from public.create_group('B 空间');");
    psql(`
      insert into public.group_members (group_id, profile_id, role) values
        ('${groupA}', '${memberA}', 'member'),
        ('${groupB}', '${memberB}', 'member');
    `);
  }, 120_000);

  afterAll(() => {
    spawnSync("docker", ["rm", "--force", containerName], { stdio: "ignore" });
  });

  test("bootstraps only the existing 蓝 profile and never a later nickname claim", () => {
    expect(psql(`select is_platform_admin from public.profiles where id = '${blueId}';`)).toBe("t");

    const laterBlue = randomUUID();
    psql(`
      insert into auth.users (id) values ('${laterBlue}');
      insert into public.profiles (id, display_name) values ('${laterBlue}', '蓝');
    `);
    expect(psql(`select is_platform_admin from public.profiles where id = '${laterBlue}';`)).toBe("f");
  });

  test("creates an admin membership with a server-generated unique invite code", () => {
    const first = psql(`
      select groups.invite_code || '|' || group_members.role
      from public.groups
      join public.group_members on group_members.group_id = groups.id
      where groups.id = '${groupA}' and group_members.profile_id = '${adminA}';
    `);
    const secondCode = authenticated(adminA, "select invite_code from public.create_group('另一个空间');");
    const [firstCode, role] = first.split("|");

    expect(role).toBe("admin");
    expect(firstCode).toMatch(/^DNF-[A-Z0-9]{12}$/);
    expect(secondCode).toMatch(/^DNF-[A-Z0-9]{12}$/);
    expect(secondCode).not.toBe(firstCode);
    expect(
      psqlFailure(`
        begin;
        set local role authenticated;
        set local request.jwt.claim.sub = '${adminA}';
        select invite_code_digest from public.groups where id = '${groupA}';
        rollback;
      `),
    ).toMatch(/permission denied/);
  });

  test("allows a space admin to manage only members of their own space", () => {
    expect(
      authenticated(
        adminA,
        `
          select public.set_group_member_role('${groupA}', '${memberA}', 'admin');
          select role from public.group_members
          where group_id = '${groupA}' and profile_id = '${memberA}';
        `,
      ),
    ).toBe("t\nadmin");
    expect(
      psqlFailure(`
        begin;
        set local role authenticated;
        set local request.jwt.claim.sub = '${adminA}';
        select public.set_group_member_role('${groupB}', '${memberB}', 'admin');
        rollback;
      `),
    ).toMatch(/member_role_forbidden/);
  });

  test("lets the platform admin manage members and open a current-space context across spaces", () => {
    expect(
      authenticated(
        blueId,
        `
          select public.set_group_member_role('${groupB}', '${memberB}', 'admin');
          select role from public.group_members
          where group_id = '${groupB}' and profile_id = '${memberB}';
          select public.set_group_member_role('${groupB}', '${memberB}', 'member');
          select role from public.group_members
          where group_id = '${groupB}' and profile_id = '${memberB}';
        `,
      ),
    ).toBe("t\nadmin\nt\nmember");
    expect(
      authenticated(
        blueId,
        `select profile_id || '|' || group_id || '|' || role || '|' || is_platform_admin from public.get_space_context('${groupB}');`,
      ),
    ).toBe(`${blueId}|${groupB}|admin|true`);
  });

  test("blocks ordinary members, legacy leader grants, cross-space targets, and direct self-promotion", () => {
    expect(
      authenticated(
        memberB,
        `
          update public.group_members set role = 'admin'
          where group_id = '${groupB}' and profile_id = '${memberB}'
          returning role;
        `,
      ),
    ).toBe("");
    expect(
      psqlFailure(`
        begin;
        set local role authenticated;
        set local request.jwt.claim.sub = '${memberB}';
        select public.set_group_member_role('${groupB}', '${memberB}', 'admin');
        rollback;
      `),
    ).toMatch(/member_role_forbidden/);
    expect(
      psqlFailure(`
        begin;
        set local role authenticated;
        set local request.jwt.claim.sub = '${adminB}';
        select public.set_group_member_role('${groupB}', '${memberB}', 'leader');
        rollback;
      `),
    ).toMatch(/invalid_member_role/);
    expect(
      psqlFailure(`
        begin;
        set local role authenticated;
        set local request.jwt.claim.sub = '${adminB}';
        select public.set_group_member_role('${groupB}', '${memberA}', 'admin');
        rollback;
      `),
    ).toMatch(/target_not_in_group/);
    expect(
      psqlFailure(`
        begin;
        set local role authenticated;
        set local request.jwt.claim.sub = '${memberB}';
        update public.profiles set is_platform_admin = true where id = '${memberB}';
        rollback;
      `),
    ).toMatch(/permission denied/);
  });
});
