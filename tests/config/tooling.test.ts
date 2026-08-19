import { execFileSync } from "node:child_process";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const invalidFixture = path.join(
  repositoryRoot,
  "tests",
  ".temporary-invalid-lint-fixture.ts",
);

afterEach(() => {
  if (existsSync(invalidFixture)) {
    rmSync(invalidFixture);
  }
});

function commandStatus(command: string, args: string[]): number {
  try {
    execFileSync(command, args, {
      cwd: repositoryRoot,
      stdio: "pipe",
    });
    return 0;
  } catch (error) {
    return (error as { status?: number }).status ?? 1;
  }
}

function npmCommandStatus(args: string[]): number {
  const npmCli = process.env.npm_execpath;

  if (!npmCli) {
    throw new Error("npm_execpath is required to verify the lint script");
  }

  return commandStatus(process.execPath, [npmCli, ...args]);
}

describe("project tooling", () => {
  it("ignores private env files while allowing the example file to be tracked", () => {
    expect(commandStatus("git", ["check-ignore", "-q", ".env"])).toBe(0);
    expect(commandStatus("git", ["check-ignore", "-q", ".env.example"])).toBe(1);
  });

  it("rejects invalid TypeScript through the lint command", () => {
    writeFileSync(invalidFixture, "const schedule: string = ;\n");

    expect(npmCommandStatus(["run", "lint"])).not.toBe(0);
  });
});
