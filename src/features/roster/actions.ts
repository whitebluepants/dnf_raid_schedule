"use server";

import { z } from "zod";

import { requireCurrentSpace, type CurrentSpace } from "@/lib/current-space";
import type { Result } from "@/lib/result";
import { createServerClient } from "@/lib/supabase/server";
import { characterSchema } from "./schemas";

function currentSpaceError(): Result<never, string> {
  return { ok: false, error: "当前空间已失效，请重新选择" };
}

function characterWriteError(message: string, fallback: string): string {
  return message.includes("scheduled_character_locked")
    ? "角色已在进行中的活动排表中，无法归档或变更定位/账号"
    : fallback;
}

function accountWriteError(message: string, fallback: string): string {
  return message.includes("scheduled_account_locked")
    ? "账号中的角色已在进行中的活动排表中，无法归档或变更账号归属"
    : fallback;
}

export async function createGameAccount(formData: FormData): Promise<Result<string, string>> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name || name.length > 80) return { ok: false, error: "请输入有效的账号名" };
  const client = await createServerClient();
  let space: CurrentSpace;
  try {
    space = await requireCurrentSpace(client);
  } catch {
    return currentSpaceError();
  }

  const { data, error } = await client
    .from("game_accounts")
    .insert({ profile_id: space.profileId, group_id: space.groupId, name })
    .select("id")
    .single();
  return error || !data ? { ok: false, error: "账号保存失败" } : { ok: true, value: data.id };
}

export type SaveCharacterInput = {
  characterId?: string;
  accountId: unknown;
  name: unknown;
  className: unknown;
  role: unknown;
  fame: unknown;
  strengthTier: unknown;
  damageScore?: unknown;
  buffScore?: unknown;
  notes?: unknown;
};

export async function saveCharacter(input: SaveCharacterInput): Promise<Result<string, string>> {
  const parsed = characterSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "角色资料不正确" };
  const rawCharacterId: unknown = input.characterId;
  if (rawCharacterId !== undefined && typeof rawCharacterId !== "string") {
    return { ok: false, error: "角色信息不正确" };
  }
  const characterId = rawCharacterId?.trim();
  if (characterId && !z.string().uuid().safeParse(characterId).success) {
    return { ok: false, error: "角色信息不正确" };
  }
  const client = await createServerClient();
  let space: CurrentSpace;
  try {
    space = await requireCurrentSpace(client);
  } catch {
    return currentSpaceError();
  }

  const { data: account, error: accountError } = await client
    .from("game_accounts")
    .select("id")
    .eq("id", parsed.data.accountId)
    .eq("profile_id", space.profileId)
    .eq("group_id", space.groupId)
    .eq("is_archived", false)
    .maybeSingle();
  if (accountError || !account) return { ok: false, error: "请选择当前空间内属于你的有效账号" };

  const payload = {
    game_account_id: parsed.data.accountId,
    profile_id: space.profileId,
    group_id: space.groupId,
    name: parsed.data.name,
    class_name: parsed.data.className,
    role: parsed.data.role,
    fame: parsed.data.fame,
    strength_tier: parsed.data.strengthTier,
    simulated_damage: parsed.data.role === "dealer" ? parsed.data.damageScore : null,
    buffer_power: parsed.data.role === "buffer" ? parsed.data.buffScore : null,
    notes: parsed.data.notes || null,
  };

  const query = characterId
    ? client.from("characters").update(payload).eq("id", characterId).eq("profile_id", space.profileId).eq("group_id", space.groupId)
    : client.from("characters").insert(payload);
  const { data, error } = await query.select("id").maybeSingle();
  return error || !data
    ? { ok: false, error: characterWriteError(error?.message ?? "", characterId ? "角色更新失败或角色不存在" : "角色保存失败，请确认账号属于自己") }
    : { ok: true, value: data.id };
}

export async function createCharacter(formData: FormData): Promise<Result<string, string>> {
  return saveCharacter({
    accountId: String(formData.get("accountId") ?? ""),
    name: String(formData.get("name") ?? ""),
    className: String(formData.get("className") ?? ""),
    role: formData.get("role"),
    fame: formData.get("fame"),
    strengthTier: formData.get("strengthTier"),
    damageScore: formData.get("damageScore") || undefined,
    buffScore: formData.get("buffScore") || undefined,
    notes: String(formData.get("notes") ?? ""),
  });
}

export async function archiveCharacter(characterId: string): Promise<Result<true, string>> {
  if (!z.string().uuid().safeParse(characterId).success) return { ok: false, error: "角色信息不正确" };
  const client = await createServerClient();
  let space: CurrentSpace;
  try {
    space = await requireCurrentSpace(client);
  } catch {
    return currentSpaceError();
  }

  const { data, error } = await client
    .from("characters")
    .update({ is_archived: true })
    .eq("id", characterId)
    .eq("profile_id", space.profileId)
    .eq("group_id", space.groupId)
    .select("id")
    .maybeSingle();
  return error || !data ? { ok: false, error: characterWriteError(error?.message ?? "", "角色归档失败或角色不存在") } : { ok: true, value: true };
}

export async function archiveGameAccount(accountId: string): Promise<Result<true, string>> {
  if (!z.string().uuid().safeParse(accountId).success) return { ok: false, error: "账号信息不正确" };
  const client = await createServerClient();
  let space: CurrentSpace;
  try {
    space = await requireCurrentSpace(client);
  } catch {
    return currentSpaceError();
  }

  const { data, error } = await client
    .from("game_accounts")
    .update({ is_archived: true })
    .eq("id", accountId)
    .eq("profile_id", space.profileId)
    .eq("group_id", space.groupId)
    .select("id")
    .maybeSingle();
  return error || !data ? { ok: false, error: accountWriteError(error?.message ?? "", "账号归档失败或账号不存在") } : { ok: true, value: true };
}
