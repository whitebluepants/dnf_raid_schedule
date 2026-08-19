import { describe, expect, test } from "vitest";
import { characterSchema } from "@/features/roster/schemas";

describe("character schema", () => {
  test("accepts dealer and buffer metrics", () => {
    expect(characterSchema.safeParse({ accountId: "a", name: "剑魂", className: "剑魂", role: "dealer", fame: "80000", strengthTier: "high", damageScore: "1200" }).success).toBe(true);
    expect(characterSchema.safeParse({ accountId: "a", name: "奶妈", className: "圣职者", role: "buffer", fame: 70000, strengthTier: "medium", buffScore: 900 }).success).toBe(true);
  });

  test("rejects invalid ownership-independent form data", () => {
    expect(characterSchema.safeParse({ accountId: "", name: "", className: "", role: "dealer", fame: 0, strengthTier: "high" }).success).toBe(false);
  });
});
