import { describe, expect, test } from "vitest";
import { loginSchema, onboardingSchema, registerSchema } from "@/features/auth/schemas";

describe("auth schemas", () => {
  test("accept valid login, registration, and onboarding payloads", () => {
    expect(loginSchema.safeParse({ email: "raid@example.com", password: "password123" }).success).toBe(true);
    expect(registerSchema.safeParse({ email: "raid@example.com", password: "password123", nickname: "团长" }).success).toBe(true);
    expect(onboardingSchema.safeParse({ nickname: "团长", inviteCode: "ABC123" }).success).toBe(true);
  });

  test("reject malformed or short fields with Chinese messages", () => {
    const result = registerSchema.safeParse({ email: "bad", password: "short", nickname: "" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.map((issue) => issue.message)).toEqual(expect.arrayContaining(["请输入有效邮箱", "密码至少 8 位", "请输入游戏昵称"]));
    expect(onboardingSchema.safeParse({ nickname: "团长", inviteCode: "123" }).success).toBe(false);
  });
});
