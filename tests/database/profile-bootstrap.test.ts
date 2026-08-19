import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const profileBootstrapPath = resolve(process.cwd(), "supabase/migrations/202608190012_profile_bootstrap.sql");

describe("profile bootstrap migration", () => {
  test("creates the profile from auth user metadata during initial signup", () => {
    const migration = readFileSync(profileBootstrapPath, "utf8");

    expect(migration).toMatch(/create or replace function public\.bootstrap_profile_from_auth_user/);
    expect(migration).toMatch(/after insert on auth\.users/);
    expect(migration).toMatch(/insert into public\.profiles \(id, display_name\)/);
    expect(migration).toMatch(/new\.raw_user_meta_data\s*->>\s*'display_name'/);
  });
});
