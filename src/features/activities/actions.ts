"use server";

import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import type { Result } from "@/lib/result";

const registrationSchema = z.object({
  raidEventId: z.string().uuid(),
  state: z.enum(["participating", "absent"]),
  characterIds: z.array(z.string().uuid()),
});

export async function setRegistration(formData: FormData): Promise<Result<true, string>> {
  const parsed = registrationSchema.safeParse({
    raidEventId: formData.get("raidEventId"),
    state: formData.get("state"),
    characterIds: formData.getAll("characterId"),
  });
  if (!parsed.success) return { ok: false, error: "报名数据不正确" };
  const client = await createServerClient();
  const { data: user } = await client.auth.getUser();
  if (!user.user) return { ok: false, error: "请先登录" };
  const { data: registration, error: registrationError } = await client.from("event_registrations").upsert({ raid_event_id: parsed.data.raidEventId, profile_id: user.user.id, state: parsed.data.state }, { onConflict: "raid_event_id,profile_id" }).select("id").single();
  if (registrationError) return { ok: false, error: "活动报名保存失败" };
  await client.from("event_character_registrations").delete().eq("raid_event_id", parsed.data.raidEventId).eq("profile_id", user.user.id);
  if (parsed.data.state === "participating" && parsed.data.characterIds.length > 0) {
    const { error } = await client.from("event_character_registrations").insert(parsed.data.characterIds.map((characterId) => ({ raid_event_id: parsed.data.raidEventId, profile_id: user.user.id, character_id: characterId })));
    if (error) return { ok: false, error: "角色报名保存失败" };
  }
  return registration ? { ok: true, value: true } : { ok: false, error: "活动报名保存失败" };
}

export async function setMemberAttendance(raidEventId: string, profileId: string, state: "participating" | "absent"): Promise<Result<true, string>> {
  if (!z.string().uuid().safeParse(raidEventId).success || !z.string().uuid().safeParse(profileId).success) return { ok: false, error: "活动信息不正确" };
  const client = await createServerClient();
  const { error } = await client.from("event_registrations").update({ state }).eq("raid_event_id", raidEventId).eq("profile_id", profileId);
  return error ? { ok: false, error: "出勤状态保存失败" } : { ok: true, value: true };
}

export async function updateDifficultyPreset(input: { presetId: string; minimumFame: number | null; autoAssignmentEnabled: boolean }): Promise<Result<true, string>> {
  const parsed = z.object({ presetId: z.string().uuid(), minimumFame: z.number().int().positive().nullable(), autoAssignmentEnabled: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "难度配置不正确" };
  const client = await createServerClient();
  const { error } = await client.from("difficulty_presets").update({ minimum_fame: parsed.data.minimumFame, auto_assignment_enabled: parsed.data.autoAssignmentEnabled }).eq("id", parsed.data.presetId);
  return error ? { ok: false, error: "难度配置保存失败" } : { ok: true, value: true };
}
