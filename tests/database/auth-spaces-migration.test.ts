import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/202608190003_auth_and_spaces.sql",
);

describe("auth and spaces migration", () => {
  test("keeps a shareable invite code and creates profiles for new password users", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toMatch(/add column if not exists invite_code text/);
    expect(migration).toMatch(/p_nickname text default null/);
    expect(migration).toMatch(/create or replace function public\.join_group_by_invite/);
  });
});
