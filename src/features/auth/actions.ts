"use server";

import { cookies } from "next/headers";

import {
  CURRENT_SPACE_COOKIE,
  isUuid,
  requireCurrentSpace,
} from "@/lib/current-space";
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

async function saveCurrentSpace(groupId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(CURRENT_SPACE_COOKIE, groupId, {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

export async function setCurrentSpace(groupId: string): Promise<Result<string, string>> {
  if (!isUuid(groupId)) return { ok: false, error: "空间信息无效" };
  const client = await createServerClient();
  const { data, error } = await client.rpc("get_space_context", {
    p_group_id: groupId,
  });
  if (error || !data?.[0]) return { ok: false, error: "你无权进入该空间" };
  await saveCurrentSpace(groupId);
  return { ok: true, value: groupId };
}

export async function joinGroup(inviteCode: string): Promise<Result<string, string>> {
  const parsed = onboardingSchema.safeParse({ inviteCode });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "入团信息不正确" };
  const client = await createServerClient();
  const { data, error } = await client.rpc("join_group_by_invite", { p_invite_code: parsed.data.inviteCode });
  if (error) return { ok: false, error: error.message.includes("invite_not_found") ? "邀请码无效" : "加入团体失败" };
  await saveCurrentSpace(data);
  return { ok: true, value: data };
}

export async function createGroup(nameInput: string): Promise<Result<string, string>> {
  const name = nameInput.trim();
  if (!name || name.length > 120) return { ok: false, error: "请输入 1 到 120 个字符的空间名称" };
  const client = await createServerClient();
  const { data, error } = await client.rpc("create_group", { p_name: name });
  const created = data?.[0];
  if (error || !created) return { ok: false, error: "创建空间失败" };
  await saveCurrentSpace(created.group_id);
  return { ok: true, value: created.group_id };
}

export async function setMemberRole(
  groupId: string,
  profileId: string,
  role: "member" | "admin",
): Promise<Result<true, string>> {
  if (!isUuid(groupId) || !isUuid(profileId) || !(["member", "admin"] as const).includes(role)) {
    return { ok: false, error: "成员或角色信息无效" };
  }

  const client = await createServerClient();
  try {
    const currentSpace = await requireCurrentSpace(client);
    if (currentSpace.groupId !== groupId) {
      return { ok: false, error: "只能管理当前空间的成员" };
    }
  } catch {
    return { ok: false, error: "当前空间已失效，请重新选择" };
  }

  const { error } = await client.rpc("set_group_member_role", {
    p_group_id: groupId,
    p_profile_id: profileId,
    p_role: role,
  });
  if (error) {
    return {
      ok: false,
      error: error.message.includes("target_not_in_group")
        ? "该成员不属于当前空间"
        : "没有权限修改该成员角色",
    };
  }
  return { ok: true, value: true };
}

export async function logout(): Promise<Result<true, string>> {
  const client = await createServerClient();
  const { error } = await client.auth.signOut();
  if (error) return { ok: false, error: "退出失败" };
  const cookieStore = await cookies();
  cookieStore.delete(CURRENT_SPACE_COOKIE);
  return { ok: true, value: true };
}
