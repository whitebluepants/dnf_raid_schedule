import { describe, expect, test } from "vitest";

import { safeNext } from "@/features/auth/credentials-form";

describe("post-login return path", () => {
  test("keeps login redirects on this site when a path contains backslashes", () => {
    expect(safeNext("/\\\\evil.example")).toBe("/spaces");
  });
});
