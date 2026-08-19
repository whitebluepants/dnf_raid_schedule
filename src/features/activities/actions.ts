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
  const { data, error } = await client.rpc("replace_event_registration", { p_raid_event_id: parsed.data.raidEventId, p_state: parsed.data.state, p_character_ids: parsed.data.characterIds });
  return error || !data ? { ok: false, error: "活动报名保存失败" } : { ok: true, value: true };
}

export async function setMemberAttendance(raidEventId: string, profileId: string, state: "participating" | "absent"): Promise<Result<true, string>> {
  if (!z.string().uuid().safeParse(raidEventId).success || !z.string().uuid().safeParse(profileId).success) return { ok: false, error: "活动信息不正确" };
  const client = await createServerClient();
  const { data, error } = await client.from("event_registrations").update({ state }).eq("raid_event_id", raidEventId).eq("profile_id", profileId).select("id").maybeSingle();
  return error || !data ? { ok: false, error: "出勤状态保存失败或报名不存在" } : { ok: true, value: true };
}

export async function updateDifficultyPreset(input: { presetId: string; minimumFame: number | null; autoAssignmentEnabled: boolean }): Promise<Result<true, string>> {
  const parsed = z.object({ presetId: z.string().uuid(), minimumFame: z.number().int().positive().nullable(), autoAssignmentEnabled: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "难度配置不正确" };
  const client = await createServerClient();
  const { data, error } = await client.from("difficulty_presets").update({ minimum_fame: parsed.data.minimumFame, auto_assignment_enabled: parsed.data.autoAssignmentEnabled }).eq("id", parsed.data.presetId).select("id").maybeSingle();
  return error || !data ? { ok: false, error: "难度配置保存失败或配置不存在" } : { ok: true, value: true };
}
