import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const actionsPath = resolve(process.cwd(), "src/features/auth/actions.ts");

describe("registration profile bootstrap", () => {
  test("does not make a second RLS-protected profile write after signUp", () => {
    const actions = readFileSync(actionsPath, "utf8");
    const registerAction = actions.match(/export async function register[\s\S]*?\n}\n\nasync function saveCurrentSpace/);

    expect(registerAction?.[0]).toBeDefined();
    expect(registerAction?.[0]).not.toContain('.from("profiles")');
  });
});
