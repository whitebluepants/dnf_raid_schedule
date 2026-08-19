"use server";

import { revalidatePath } from "next/cache";

import { CurrentSpaceError, requireCurrentSpace } from "@/lib/current-space";
import type { Result } from "@/lib/result";
import { createServerClient } from "@/lib/supabase/server";
import { createRaidEvent as persistRaidEvent, getActivity, syncEventWaves as persistEventWaves, updateDifficultyPreset as persistDifficultyPreset } from "./repository";
import { difficultyPresetSchema, raidEventSchema, registrationSchema, wavePlanSchema } from "./schemas";

function fieldValue(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "");
}

export async function createRaidEvent(formData: FormData): Promise<Result<string, string>> {
  const waves = formData.getAll("wave").map((value, index) => {
    const [difficulty, order] = String(value).split(":");
    return { difficulty, order: Number(order || index + 1) };
  });
  const parsed = raidEventSchema.safeParse({ title: fieldValue(formData, "title"), eventDate: fieldValue(formData, "eventDate"), gameWeek: fieldValue(formData, "gameWeek"), waves });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "活动信息不正确" };
  const client = await createServerClient();
  try {
    const result = await persistRaidEvent(client, await requireCurrentSpace(client), parsed.data);
    if (result.ok) revalidatePath("/activities");
    return result;
  } catch (error) {
    console.error("[createRaidEvent]", error);
    return { ok: false, error: error instanceof CurrentSpaceError ? "请先选择可访问的空间" : "活动创建失败" };
  }
}

export async function syncEventWaves(eventId: string, input: unknown): Promise<Result<true, string>> {
  const parsed = wavePlanSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "波次信息不正确" };
  const client = await createServerClient();
  try {
    const space = await requireCurrentSpace(client);
    const event = await getActivity(client, eventId, space.groupId);
    if (!event.ok) return { ok: false, error: event.error };
    if (!event.value) return { ok: false, error: "活动不存在、已归档或不属于当前空间" };
    const result = await persistEventWaves(client, space, eventId, parsed.data);
    if (result.ok) {
      revalidatePath("/activities");
      revalidatePath(`/activities/${eventId}/schedule`);
    }
    return result;
  } catch (error) {
    return { ok: false, error: error instanceof CurrentSpaceError ? "请先选择可访问的空间" : "波次调整失败" };
  }
}

export async function setRegistration(formData: FormData): Promise<Result<true, string>> {
  const parsed = registrationSchema.safeParse({ raidEventId: fieldValue(formData, "raidEventId"), state: fieldValue(formData, "state"), characterIds: formData.getAll("characterId") });
  if (!parsed.success) return { ok: false, error: "报名数据不正确" };
  const client = await createServerClient();
  try {
    const space = await requireCurrentSpace(client);
    const event = await getActivity(client, parsed.data.raidEventId, space.groupId);
    if (!event.ok) return { ok: false, error: event.error };
    if (!event.value) return { ok: false, error: "活动不存在、已归档或不属于当前空间" };
    const { data, error } = await client.rpc("replace_event_registration", { p_raid_event_id: parsed.data.raidEventId, p_state: parsed.data.state, p_character_ids: parsed.data.characterIds });
    if (error || !data) return { ok: false, error: "报名保存失败：请只选择自己当前空间的未归档角色" };
    revalidatePath(`/activities/${parsed.data.raidEventId}/signup`);
    revalidatePath("/activities");
    return { ok: true, value: true };
  } catch (error) {
    return { ok: false, error: error instanceof CurrentSpaceError ? "请先选择可访问的空间" : "活动报名保存失败" };
  }
}

export async function setMemberAttendance(raidEventId: string, state: "participating" | "absent"): Promise<Result<true, string>> {
  const parsed = registrationSchema.pick({ raidEventId: true, state: true }).safeParse({ raidEventId, state });
  if (!parsed.success) return { ok: false, error: "活动信息不正确" };
  const client = await createServerClient();
  try {
    const space = await requireCurrentSpace(client);
    const event = await getActivity(client, parsed.data.raidEventId, space.groupId);
    if (!event.ok) return { ok: false, error: event.error };
    if (!event.value) return { ok: false, error: "活动不存在、已归档或不属于当前空间" };
    const { data, error } = await client.rpc("set_schedule_member_attendance", {
      p_raid_event_id: parsed.data.raidEventId,
      p_profile_id: space.profileId,
      p_state: parsed.data.state,
    });
    if (error || !data) return { ok: false, error: "请先完成报名后再修改出勤状态" };
    revalidatePath(`/activities/${parsed.data.raidEventId}/signup`);
    return { ok: true, value: true };
  } catch (error) {
    return { ok: false, error: error instanceof CurrentSpaceError ? "请先选择可访问的空间" : "出勤状态保存失败" };
  }
}

export async function updateDifficultyPreset(input: unknown): Promise<Result<true, string>> {
  const parsed = difficultyPresetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "难度配置不正确" };
  const client = await createServerClient();
  try {
    const result = await persistDifficultyPreset(client, await requireCurrentSpace(client), parsed.data);
    if (result.ok) revalidatePath("/settings/difficulties");
    return result;
  } catch (error) {
    return { ok: false, error: error instanceof CurrentSpaceError ? "请先选择可访问的空间" : "难度参考保存失败" };
  }
}
