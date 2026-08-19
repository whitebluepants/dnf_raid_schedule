import { describe, expect, test } from "vitest";
import {
  loginSchema,
  nicknameToInternalEmail,
  onboardingSchema,
  registerSchema,
} from "@/features/auth/schemas";

describe("auth schemas", () => {
  test("accepts nickname/password auth and invite-only joining", () => {
    expect(loginSchema.safeParse({ nickname: "团长", password: "password123" }).success).toBe(true);
    expect(registerSchema.safeParse({ nickname: "团长", password: "password123" }).success).toBe(true);
    expect(onboardingSchema.safeParse({ inviteCode: "ABC123" }).success).toBe(true);
  });

  test("does not require an email and rejects malformed nickname/password fields", () => {
    const result = registerSchema.safeParse({ password: "short", nickname: "" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.map((issue) => issue.message)).toEqual(expect.arrayContaining(["密码至少 8 位", "请输入昵称"]));
    expect(onboardingSchema.safeParse({ inviteCode: "123" }).success).toBe(false);
  });

  test("maps a Chinese nickname to a stable hidden Supabase email", () => {
    expect(nicknameToInternalEmail("  团长  ")).toMatch(
      /^member-[a-f0-9]{64}@auth\.team-scheduler\.local$/,
    );
    expect(nicknameToInternalEmail("团长")).toBe(
      nicknameToInternalEmail("团长"),
    );
  });
});
