"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireCurrentSpace } from "@/lib/current-space";
import { createServerClient } from "@/lib/supabase/server";
import {
  canManageSchedule,
  generateAndPersistSchedule as persistGeneratedSchedule,
  getScheduleWorkbench,
  publishSchedule as publishScheduleRepository,
  replaceEventScheduleSnapshots as replaceEventScheduleSnapshotsRepository,
  replaceScheduleSnapshot as replaceScheduleSnapshotRepository,
  setMemberAttendance as setMemberAttendanceRepository,
  type ScheduleMutationResult,
} from "./repository";
import { runScheduleAction } from "./action-result";

const uuid = z.string().uuid();
const snapshotSchema = z.array(z.object({
  team_color: z.enum(["red", "yellow", "green"]),
  slot_index: z.number().int().min(1).max(4),
  slot_role: z.enum(["dealer", "buffer"]),
  character_id: uuid.nullable(),
  game_account_id: uuid.nullable(),
  profile_id: uuid.nullable(),
  is_locked: z.boolean(),
})).length(12);

const invalid = <T>(message: string): ScheduleMutationResult<T> => ({ status: "validation_error", message });

export async function replaceScheduleSnapshot(input: {
  raidEventId: string;
  raidWaveId: string;
  expectedVersion: number;
  snapshot: unknown;
}): Promise<ScheduleMutationResult<{ version: number }>> {
  const parsed = z.object({ raidEventId: uuid, raidWaveId: uuid, expectedVersion: z.number().int().positive(), snapshot: snapshotSchema }).safeParse(input);
  if (!parsed.success) return invalid("排表数据格式不正确");
  return runScheduleAction(async () => {
    const client = await createServerClient();
    const space = await requireCurrentSpace(client);
    if (!canManageSchedule(space)) return { status: "forbidden", message: "只有空间管理员可以保存排表" };
    const workbench = await getScheduleWorkbench(client, space, parsed.data.raidEventId);
    if (!workbench?.waves.some((wave) => wave.id === parsed.data.raidWaveId)) return { status: "forbidden", message: "活动或波次不属于当前空间" };
    const result = await replaceScheduleSnapshotRepository(client, parsed.data);
    if (result.status === "success") revalidatePath(`/activities/${parsed.data.raidEventId}/schedule`);
    return result;
  });
}

export async function generateAndPersistSchedule(eventId: string): Promise<ScheduleMutationResult<{ versions: Record<string, number> }>> {
  const parsed = uuid.safeParse(eventId);
  if (!parsed.success) return invalid("活动编号格式不正确");
  return runScheduleAction(async () => {
    const client = await createServerClient();
    const space = await requireCurrentSpace(client);
    if (!canManageSchedule(space)) return { status: "forbidden", message: "只有空间管理员可以生成排表" };
    const workbench = await getScheduleWorkbench(client, space, parsed.data);
    if (!workbench) return { status: "forbidden", message: "活动不属于当前空间" };
    const result = await persistGeneratedSchedule(client, workbench);
    if (result.status === "success") revalidatePath(`/activities/${parsed.data}/schedule`);
    return result;
  });
}

export async function saveScheduleDraft(input: {
  raidEventId: string;
  expectedVersions: Record<string, number>;
  snapshots: Record<string, unknown>;
}): Promise<ScheduleMutationResult<{ versions: Record<string, number> }>> {
  const parsed = z.object({
    raidEventId: uuid,
    expectedVersions: z.record(uuid, z.number().int().positive()),
    snapshots: z.record(uuid, snapshotSchema),
  }).safeParse(input);
  if (!parsed.success) return invalid("排表数据格式不正确");
  return runScheduleAction(async () => {
    const client = await createServerClient();
    const space = await requireCurrentSpace(client);
    if (!canManageSchedule(space)) return { status: "forbidden", message: "只有空间管理员可以保存排表" };
    const workbench = await getScheduleWorkbench(client, space, parsed.data.raidEventId);
    const waveIds = new Set(workbench?.waves.map((wave) => wave.id) ?? []);
    if (!workbench || Object.keys(parsed.data.snapshots).some((waveId) => !waveIds.has(waveId))) return { status: "forbidden", message: "活动或波次不属于当前空间" };
    const result = await replaceEventScheduleSnapshotsRepository(client, parsed.data);
    if (result.status === "success") revalidatePath(`/activities/${parsed.data.raidEventId}/schedule`);
    return result;
  });
}

export async function setMemberAttendance(eventId: string, state: "participating" | "absent"): Promise<ScheduleMutationResult<{ changed: boolean }>> {
  const parsed = z.object({ eventId: uuid, state: z.enum(["participating", "absent"]) }).safeParse({ eventId, state });
  if (!parsed.success) return invalid("出席状态格式不正确");
  return runScheduleAction(async () => {
    const client = await createServerClient();
    const space = await requireCurrentSpace(client);
    const workbench = await getScheduleWorkbench(client, space, parsed.data.eventId);
    if (!workbench) return { status: "forbidden", message: "活动不属于当前空间" };
    const result = await setMemberAttendanceRepository(client, { raidEventId: parsed.data.eventId, profileId: space.profileId, state: parsed.data.state });
    if (result.status === "success") revalidatePath(`/activities/${parsed.data.eventId}/schedule`);
    return result;
  });
}

export async function publishSchedule(eventId: string, versions: Record<string, number>): Promise<ScheduleMutationResult<{ published: boolean }>> {
  const parsed = z.object({ eventId: uuid, versions: z.record(uuid, z.number().int().positive()) }).safeParse({ eventId, versions });
  if (!parsed.success) return invalid("排表版本格式不正确");
  return runScheduleAction(async () => {
    const client = await createServerClient();
    const space = await requireCurrentSpace(client);
    if (!canManageSchedule(space)) return { status: "forbidden", message: "只有空间管理员可以发布排表" };
    const workbench = await getScheduleWorkbench(client, space, parsed.data.eventId);
    if (!workbench) return { status: "forbidden", message: "活动不属于当前空间" };
    const result = await publishScheduleRepository(client, { raidEventId: parsed.data.eventId, versions: parsed.data.versions });
    if (result.status === "success") {
      revalidatePath(`/activities/${parsed.data.eventId}/schedule`);
      revalidatePath("/activities");
    }
    return result;
  });
}
