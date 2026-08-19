"use server";

import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import type { Result } from "@/lib/result";

const snapshotSchema = z.array(z.object({
  team_color: z.enum(["red", "yellow", "green"]),
  slot_index: z.number().int().min(1).max(4),
  slot_role: z.enum(["dealer", "buffer"]),
  character_id: z.string().uuid().nullable(),
  game_account_id: z.string().uuid().nullable(),
  profile_id: z.string().uuid().nullable(),
  is_locked: z.boolean().optional(),
}));

export async function replaceScheduleSnapshot(input: {
  raidEventId: string;
  raidWaveId: string;
  expectedVersion: number;
  snapshot: unknown;
}): Promise<Result<number, string>> {
  const parsed = snapshotSchema.safeParse(input.snapshot);
  if (!parsed.success) return { ok: false, error: "排表数据格式不正确" };
  const client = await createServerClient();
  const { data, error } = await client.rpc("replace_schedule_snapshot", {
    p_raid_event_id: input.raidEventId,
    p_raid_wave_id: input.raidWaveId,
    p_expected_version: input.expectedVersion,
    p_snapshot: parsed.data,
  });
  if (error) {
    if (error.message.includes("schedule_version_conflict")) return { ok: false, error: "排表已被其他人更新，请刷新后重试" };
    if (error.message.includes("schedule_forbidden")) return { ok: false, error: "只有团长或管理员可以调整排表" };
    return { ok: false, error: "保存排表失败" };
  }
  return { ok: true, value: data };
}
