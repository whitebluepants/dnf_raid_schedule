"use server";

import { createServerClient } from "@/lib/supabase/server";
import type { Result } from "@/lib/result";
import { characterSchema } from "./schemas";

export async function createGameAccount(formData: FormData): Promise<Result<string, string>> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name || name.length > 80) return { ok: false, error: "请输入有效的账号名" };
  const client = await createServerClient();
  const { data: user } = await client.auth.getUser();
  if (!user.user) return { ok: false, error: "请先登录" };
  const { data, error } = await client.from("game_accounts").insert({ profile_id: user.user.id, name }).select("id").single();
  return error ? { ok: false, error: "账号保存失败" } : { ok: true, value: data.id };
}

export async function createCharacter(formData: FormData): Promise<Result<string, string>> {
  const parsed = characterSchema.safeParse({
    accountId: formData.get("accountId"),
    name: formData.get("name"),
    className: formData.get("className"),
    role: formData.get("role"),
    fame: formData.get("fame"),
    strengthTier: formData.get("strengthTier"),
    damageScore: formData.get("damageScore") || null,
    buffScore: formData.get("buffScore") || null,
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "角色资料不正确" };
  const client = await createServerClient();
  const { data: user } = await client.auth.getUser();
  if (!user.user) return { ok: false, error: "请先登录" };
  const { data, error } = await client.from("characters").insert({
    game_account_id: parsed.data.accountId,
    profile_id: user.user.id,
    name: parsed.data.name,
    class_name: parsed.data.className,
    role: parsed.data.role,
    fame: parsed.data.fame,
    strength_tier: parsed.data.strengthTier,
    simulated_damage: parsed.data.role === "dealer" ? parsed.data.damageScore ?? null : null,
    buffer_power: parsed.data.role === "buffer" ? parsed.data.buffScore ?? null : null,
    notes: parsed.data.notes ?? null,
  }).select("id").single();
  return error ? { ok: false, error: "角色保存失败，请确认账号属于自己" } : { ok: true, value: data.id };
}

export async function archiveCharacter(characterId: string): Promise<Result<true, string>> {
  const client = await createServerClient();
  const { error } = await client.from("characters").update({ is_archived: true }).eq("id", characterId);
  return error ? { ok: false, error: "角色归档失败" } : { ok: true, value: true };
}
