"use server";

import { createServerClient } from "@/lib/supabase/server";
import type { Result } from "@/lib/result";
import { loginSchema, nicknameToInternalEmail, onboardingSchema, registerSchema } from "./schemas";

function formValue(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "");
}

export async function login(formData: FormData): Promise<Result<true, string>> {
  const parsed = loginSchema.safeParse({ nickname: formValue(formData, "nickname"), password: formValue(formData, "password") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "登录信息不正确" };
  const client = await createServerClient();
  const { data, error } = await client.auth.signInWithPassword({
    email: nicknameToInternalEmail(parsed.data.nickname),
    password: parsed.data.password,
  });
  if (error || !data.user) return { ok: false, error: "昵称或密码不正确" };
  const { error: profileError } = await client
    .from("profiles")
    .upsert({ id: data.user.id, display_name: parsed.data.nickname.trim() }, { onConflict: "id" });
  return profileError ? { ok: false, error: "登录成功，但资料初始化失败" } : { ok: true, value: true };
}

export async function register(formData: FormData): Promise<Result<true, string>> {
  const parsed = registerSchema.safeParse({ password: formValue(formData, "password"), nickname: formValue(formData, "nickname") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "注册信息不正确" };
  const client = await createServerClient();
  const { data, error } = await client.auth.signUp({
    email: nicknameToInternalEmail(parsed.data.nickname),
    password: parsed.data.password,
    options: { data: { display_name: parsed.data.nickname.trim() } },
  });
  if (error) return { ok: false, error: "该昵称可能已被使用，或注册暂时不可用" };
  if (!data.session || !data.user) return { ok: false, error: "请让管理员在 Supabase 关闭邮箱确认后再注册" };
  const { error: profileError } = await client
    .from("profiles")
    .upsert({ id: data.user.id, display_name: parsed.data.nickname.trim() }, { onConflict: "id" });
  return profileError ? { ok: false, error: "注册成功，但资料初始化失败" } : { ok: true, value: true };
}

export async function joinGroup(formData: FormData): Promise<Result<string, string>> {
  const parsed = onboardingSchema.safeParse({ inviteCode: formValue(formData, "inviteCode") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "入团信息不正确" };
  const client = await createServerClient();
  const { data, error } = await client.rpc("join_group_by_invite", { p_invite_code: parsed.data.inviteCode });
  return error ? { ok: false, error: error.message.includes("invite_not_found") ? "邀请码无效" : "加入团体失败" } : { ok: true, value: data };
}

export async function createGroup(formData: FormData): Promise<Result<string, string>> {
  const name = formValue(formData, "name").trim();
  const inviteCode = formValue(formData, "inviteCode").trim();
  if (!name || name.length > 120) return { ok: false, error: "请输入 1 到 120 个字符的空间名称" };
  if (inviteCode.length < 6 || inviteCode.length > 64) return { ok: false, error: "邀请码需要 6 到 64 位" };
  const client = await createServerClient();
  const { data, error } = await client.rpc("create_group", { p_name: name, p_invite_code: inviteCode });
  return error ? { ok: false, error: error.message.includes("invite_code_in_use") ? "邀请码已被使用" : "创建空间失败" } : { ok: true, value: data };
}

export async function logout(): Promise<Result<true, string>> {
  const client = await createServerClient();
  const { error } = await client.auth.signOut();
  return error ? { ok: false, error: "退出失败" } : { ok: true, value: true };
}
