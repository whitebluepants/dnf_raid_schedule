import { z } from "zod";
import { createHash } from "node:crypto";

const nicknameSchema = z.string().trim().min(1, "请输入昵称").max(80, "昵称不能超过 80 个字符");

export const loginSchema = z.object({
  nickname: nicknameSchema,
  password: z.string().min(8, "密码至少 8 位"),
});

export const registerSchema = loginSchema;

export const onboardingSchema = z.object({
  inviteCode: z.string().trim().min(6, "邀请码至少 6 位").max(64, "邀请码不能超过 64 位"),
});

/** Supabase password auth is email-based; this opaque alias keeps that detail out of the product UI. */
export function nicknameToInternalEmail(nickname: string): string {
  const normalized = nickname.trim().normalize("NFKC").toLocaleLowerCase("zh-CN");
  const digest = createHash("sha256").update(normalized).digest("hex");
  return `member-${digest}@auth.team-scheduler.local`;
}
