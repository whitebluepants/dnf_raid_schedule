import { z } from "zod";

export const loginSchema = z.object({
  email: z.email("请输入有效邮箱"),
  password: z.string().min(8, "密码至少 8 位"),
});

export const registerSchema = loginSchema.extend({
  nickname: z.string().trim().min(1, "请输入游戏昵称").max(80, "昵称不能超过 80 个字符"),
});

export const onboardingSchema = z.object({
  nickname: z.string().trim().min(1, "请输入游戏昵称").max(80, "昵称不能超过 80 个字符"),
  inviteCode: z.string().trim().min(6, "邀请码至少 6 位").max(64, "邀请码不能超过 64 位"),
});
