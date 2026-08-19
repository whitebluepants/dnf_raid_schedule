"use server";

import { createServerClient } from "@/lib/supabase/server";
import type { Result } from "@/lib/result";
import { loginSchema, onboardingSchema, registerSchema } from "./schemas";

function formValue(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "");
}

export async function login(formData: FormData): Promise<Result<true, string>> {
  const parsed = loginSchema.safeParse({ email: formValue(formData, "email"), password: formValue(formData, "password") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "登录信息不正确" };
  const client = await createServerClient();
  const { error } = await client.auth.signInWithPassword(parsed.data);
  return error ? { ok: false, error: "邮箱或密码不正确" } : { ok: true, value: true };
}

export async function register(formData: FormData): Promise<Result<true, string>> {
  const parsed = registerSchema.safeParse({ email: formValue(formData, "email"), password: formValue(formData, "password"), nickname: formValue(formData, "nickname") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "注册信息不正确" };
  const client = await createServerClient();
  const { error } = await client.auth.signUp({ email: parsed.data.email, password: parsed.data.password, options: { data: { display_name: parsed.data.nickname } } });
  return error ? { ok: false, error: "注册失败，请稍后重试" } : { ok: true, value: true };
}

export async function joinGroup(formData: FormData): Promise<Result<string, string>> {
  const parsed = onboardingSchema.safeParse({ nickname: formValue(formData, "nickname"), inviteCode: formValue(formData, "inviteCode") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "入团信息不正确" };
  const client = await createServerClient();
  const { data, error } = await client.rpc("join_group_by_invite", { p_invite_code: parsed.data.inviteCode, p_nickname: parsed.data.nickname });
  return error ? { ok: false, error: error.message.includes("invite_not_found") ? "邀请码无效" : "加入团体失败" } : { ok: true, value: data };
}

export async function logout(): Promise<Result<true, string>> {
  const client = await createServerClient();
  const { error } = await client.auth.signOut();
  return error ? { ok: false, error: "退出失败" } : { ok: true, value: true };
}
