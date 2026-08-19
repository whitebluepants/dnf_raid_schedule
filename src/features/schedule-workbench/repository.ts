import type { SupabaseClient } from "@supabase/supabase-js";

import type { CurrentSpace } from "@/lib/current-space";
import type { Database, Json } from "@/lib/database.types";
import { generateSchedule } from "@/features/scheduling/generate-schedule";
import type {
  CandidateCharacter,
  DifficultyCode,
  DifficultyPreset,
  ScheduledSlot,
  ScheduledTeam,
  ScheduledWave,
  TeamColor,
} from "@/features/scheduling/types";

type Client = SupabaseClient<Database>;

export type WorkbenchCharacter = CandidateCharacter & {
  name: string;
  memberName: string;
  accountName: string;
};

export type WorkbenchSlot = Omit<ScheduledSlot, "character"> & { character: WorkbenchCharacter | null };
export type WorkbenchTeam = Omit<ScheduledTeam, "slots"> & { slots: WorkbenchSlot[] };
export type WorkbenchWave = Omit<ScheduledWave, "teams"> & {
  number: number;
  status: Database["public"]["Enums"]["event_state"];
  version: number;
  teams: Record<TeamColor, WorkbenchTeam>;
};

export type ScheduleWorkbenchData = {
  event: {
    id: string;
    title: string;
    gameWeek: string;
    eventDate: string;
    status: Database["public"]["Enums"]["event_state"];
  };
  waves: WorkbenchWave[];
  characters: WorkbenchCharacter[];
  weeklyUsedCharacterIds: string[];
  difficultyPresets: Partial<Record<DifficultyCode, DifficultyPreset>>;
  ownAttendance: Database["public"]["Enums"]["registration_state"] | null;
  canManage: boolean;
};

export type SnapshotSlot = {
  team_color: TeamColor;
  slot_index: number;
  slot_role: Database["public"]["Enums"]["character_role"];
  character_id: string | null;
  game_account_id: string | null;
  profile_id: string | null;
  is_locked: boolean;
};

export type ScheduleMutationResult<T = undefined> =
  | { status: "success"; data: T }
  | { status: "conflict" | "validation_error" | "forbidden" | "error"; message: string };

export function canManageSchedule(space: Pick<CurrentSpace, "role" | "isPlatformAdmin">): boolean {
  return space.isPlatformAdmin || space.role === "admin" || space.role === "leader";
}

function emptyWave(
  id: string,
  number: number,
  difficulty: DifficultyCode,
  status: Database["public"]["Enums"]["event_state"],
  version: number,
): WorkbenchWave {
  const team = (color: TeamColor) => ({
    color,
    slots: [
      { slotId: `${color}-1`, role: "buffer" as const, character: null },
      { slotId: `${color}-2`, role: "dealer" as const, character: null },
      { slotId: `${color}-3`, role: "dealer" as const, character: null },
      { slotId: `${color}-4`, role: "dealer" as const, character: null },
    ],
  });
  return {
    id,
    number,
    difficulty,
    status,
    version,
    teams: { red: team("red"), yellow: team("yellow"), green: team("green") },
    gaps: [],
  };
}

function throwQueryError(error: { message: string } | null, label: string): void {
  if (error) throw new Error(`${label}: ${error.message}`);
}

export async function getScheduleWorkbench(
  client: Client,
  space: CurrentSpace,
  eventId: string,
): Promise<ScheduleWorkbenchData | null> {
  const { data: event, error: eventError } = await client
    .from("raid_events")
    .select("id, group_id, title, game_week, event_date, status")
    .eq("id", eventId)
    .eq("group_id", space.groupId)
    .neq("status", "archived")
    .maybeSingle();
  throwQueryError(eventError, "读取活动失败");
  if (!event) return null;
  const canManage = canManageSchedule(space);
  if (!canManage && event.status !== "published") return null;

  const [wavesResult, registrationsResult, characterRegistrationsResult, usageResult, presetsResult] = await Promise.all([
    client.from("raid_waves").select("id, wave_number, difficulty, status, version").eq("raid_event_id", eventId).neq("status", "archived").order("wave_number"),
    client.from("event_registrations").select("profile_id, state").eq("raid_event_id", eventId),
    client.from("event_character_registrations").select("profile_id, character_id").eq("raid_event_id", eventId),
    client.from("character_weekly_usage").select("character_id").eq("game_week", event.game_week).neq("raid_event_id", eventId),
    client.from("difficulty_presets").select("group_id, code, minimum_fame, red_dealer_fame, yellow_dealer_fame, green_dealer_fame, red_buffer_power, yellow_buffer_power, green_buffer_power").or(`group_id.is.null,group_id.eq.${space.groupId}`),
  ]);
  throwQueryError(wavesResult.error, "读取波次失败");
  throwQueryError(registrationsResult.error, "读取报名失败");
  throwQueryError(characterRegistrationsResult.error, "读取报名角色失败");
  throwQueryError(usageResult.error, "读取周使用记录失败");
  throwQueryError(presetsResult.error, "读取难度配置失败");

  const waveRows = wavesResult.data ?? [];
  let slotRows: Array<Pick<Database["public"]["Tables"]["schedule_slots"]["Row"], "raid_wave_id" | "team_color" | "slot_index" | "slot_role" | "assigned_character_id" | "is_locked">> = [];
  if (waveRows.length) {
    const result = await client
      .from("schedule_slots")
      .select("raid_wave_id, team_color, slot_index, slot_role, assigned_character_id, is_locked")
      .in("raid_wave_id", waveRows.map((wave) => wave.id));
    throwQueryError(result.error, "读取排表失败");
    slotRows = result.data ?? [];
  }

  const participatingProfiles = new Set(
    (registrationsResult.data ?? [])
      .filter((registration) => registration.state === "participating")
      .map((registration) => registration.profile_id),
  );
  const registeredIds = new Set(
    (characterRegistrationsResult.data ?? [])
      .filter((registration) => participatingProfiles.has(registration.profile_id))
      .map((registration) => registration.character_id),
  );
  const registrationOwners = new Map(
    (characterRegistrationsResult.data ?? [])
      .filter((registration) => participatingProfiles.has(registration.profile_id))
      .map((registration) => [registration.character_id, registration.profile_id]),
  );
  const scheduledIds = new Set(slotRows.flatMap((slot) => slot.assigned_character_id ? [slot.assigned_character_id] : []));
  const readableCharacterIds = new Set([...registeredIds, ...scheduledIds]);

  const { data: characterRows, error: charactersError } = readableCharacterIds.size
    ? await client
      .from("characters")
      .select("id, game_account_id, profile_id, name, role, fame, strength_tier, simulated_damage, buffer_power")
      .eq("group_id", space.groupId)
      .eq("is_archived", false)
      .in("id", [...readableCharacterIds])
    : { data: [], error: null };
  throwQueryError(charactersError, "读取角色失败");

  const accountIds = [...new Set((characterRows ?? []).map((character) => character.game_account_id))];
  const profileIds = [...new Set((characterRows ?? []).map((character) => character.profile_id))];
  const [{ data: accounts, error: accountsError }, { data: profiles, error: profilesError }] = await Promise.all([
    accountIds.length
      ? client.from("game_accounts").select("id, group_id, name").eq("group_id", space.groupId).in("id", accountIds)
      : Promise.resolve({ data: [], error: null }),
    profileIds.length
      ? client.from("profiles").select("id, display_name").in("id", profileIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  throwQueryError(accountsError, "读取账号失败");
  throwQueryError(profilesError, "读取成员失败");
  const accountNames = new Map((accounts ?? []).map((account) => [account.id, account.name]));
  const memberNames = new Map((profiles ?? []).map((profile) => [profile.id, profile.display_name]));
  const allCharacters: WorkbenchCharacter[] = (characterRows ?? []).map((character) => ({
    id: character.id,
    accountId: character.game_account_id,
    profileId: character.profile_id,
    name: character.name,
    memberName: memberNames.get(character.profile_id) ?? "未知成员",
    accountName: accountNames.get(character.game_account_id) ?? "未知账号",
    role: character.role,
    fame: character.fame,
    strengthTier: character.strength_tier,
    damageScore: character.simulated_damage,
    buffScore: character.buffer_power,
  }));
  const characters = allCharacters.filter((character) =>
    registeredIds.has(character.id)
    && registrationOwners.get(character.id) === character.profileId
    && !(usageResult.data ?? []).some((usage) => usage.character_id === character.id),
  );
  const byCharacterId = new Map(allCharacters.map((character) => [character.id, character]));
  const waves = waveRows.map((row) => {
    const wave = emptyWave(row.id, row.wave_number, row.difficulty, row.status, row.version);
    for (const slotRow of slotRows.filter((slot) => slot.raid_wave_id === row.id)) {
      const slot = wave.teams[slotRow.team_color].slots[slotRow.slot_index - 1];
      if (!slot) continue;
      slot.role = slotRow.slot_role;
      slot.character = slotRow.assigned_character_id ? byCharacterId.get(slotRow.assigned_character_id) ?? null : null;
      slot.locked = slotRow.is_locked;
    }
    return wave;
  });
  const difficultyPresets: Partial<Record<DifficultyCode, DifficultyPreset>> = {};
  for (const preset of presetsResult.data ?? []) {
    if (preset.group_id === space.groupId || !difficultyPresets[preset.code]) {
      difficultyPresets[preset.code] = {
        minimumFame: preset.minimum_fame,
        redDealerFame: preset.red_dealer_fame,
        yellowDealerFame: preset.yellow_dealer_fame,
        greenDealerFame: preset.green_dealer_fame,
        redBufferPower: preset.red_buffer_power,
        yellowBufferPower: preset.yellow_buffer_power,
        greenBufferPower: preset.green_buffer_power,
      };
    }
  }
  const ownAttendance = (registrationsResult.data ?? []).find((registration) => registration.profile_id === space.profileId)?.state ?? null;
  return {
    event: { id: event.id, title: event.title, gameWeek: event.game_week, eventDate: event.event_date, status: event.status },
    waves,
    characters,
    weeklyUsedCharacterIds: (usageResult.data ?? []).map((usage) => usage.character_id),
    difficultyPresets,
    ownAttendance,
    canManage,
  };
}

function mutationError(error: { message: string } | null): ScheduleMutationResult<never> {
  const message = error?.message ?? "unknown";
  if (message.includes("schedule_version_conflict")) return { status: "conflict", message: "排表已被其他人更新，请刷新后重试" };
  if (message.includes("schedule_forbidden") || message.includes("attendance_forbidden")) return { status: "forbidden", message: "你没有权限执行这个操作" };
  if (/duplicate|weekly_conflict|not_registered|registration_invalid|invalid_|schedule_incomplete|schedule_role_mismatch/.test(message)) {
    return { status: "validation_error", message: "排表不满足发布或保存条件，请检查空槽、报名、账号与周次数冲突" };
  }
  return { status: "error", message: `操作失败，请重试（请求 ${crypto.randomUUID().slice(0, 8)}）` };
}

export async function replaceScheduleSnapshot(
  client: Pick<Client, "rpc">,
  input: { raidEventId: string; raidWaveId: string; expectedVersion: number; snapshot: SnapshotSlot[] },
): Promise<ScheduleMutationResult<{ version: number }>> {
  const { data, error } = await client.rpc("replace_schedule_snapshot", {
    p_raid_event_id: input.raidEventId,
    p_raid_wave_id: input.raidWaveId,
    p_expected_version: input.expectedVersion,
    p_snapshot: input.snapshot as unknown as Json,
  });
  return error ? mutationError(error) : { status: "success", data: { version: data } };
}

export async function replaceEventScheduleSnapshots(
  client: Pick<Client, "rpc">,
  input: { raidEventId: string; expectedVersions: Record<string, number>; snapshots: Record<string, SnapshotSlot[]> },
): Promise<ScheduleMutationResult<{ versions: Record<string, number> }>> {
  const { data, error } = await client.rpc("replace_event_schedule_snapshots", {
    p_raid_event_id: input.raidEventId,
    p_expected_versions: input.expectedVersions as unknown as Json,
    p_snapshots: input.snapshots as unknown as Json,
  });
  return error ? mutationError(error) : { status: "success", data: { versions: data as Record<string, number> } };
}

export async function generateAndPersistSchedule(
  client: Client,
  data: ScheduleWorkbenchData,
): Promise<ScheduleMutationResult<{ versions: Record<string, number> }>> {
  const generated = generateSchedule({
    characters: data.characters,
    waves: data.waves.map((wave) => ({
      id: wave.id,
      waveNumber: wave.number,
      difficulty: wave.difficulty,
      lockedAssignments: Object.values(wave.teams).flatMap((team) => team.slots.flatMap((slot, index) =>
        slot.locked ? [{ team: team.color, slotIndex: index + 1, characterId: slot.character?.id ?? `locked-empty:${wave.id}:${slot.slotId}` }] : [],
      )),
    })),
    weeklyUsedCharacterIds: data.weeklyUsedCharacterIds,
    difficultyPresets: data.difficultyPresets,
  });
  if (generated.waves.some((generatedWave) => !data.waves.some((wave) => wave.id === generatedWave.id))) {
    return { status: "validation_error", message: "波次数据已变化，请刷新后重试" };
  }
  return replaceEventScheduleSnapshots(client, {
    raidEventId: data.event.id,
    expectedVersions: Object.fromEntries(data.waves.map((wave) => [wave.id, wave.version])),
    snapshots: Object.fromEntries(generated.waves.map((wave) => [wave.id, waveToSnapshot(wave)])),
  });
}

export async function setMemberAttendance(
  client: Pick<Client, "rpc">,
  input: { raidEventId: string; profileId: string; state: Database["public"]["Enums"]["registration_state"] },
): Promise<ScheduleMutationResult<{ changed: boolean }>> {
  const { data, error } = await client.rpc("set_schedule_member_attendance", {
    p_raid_event_id: input.raidEventId,
    p_profile_id: input.profileId,
    p_state: input.state,
  });
  return error ? mutationError(error) : { status: "success", data: { changed: data } };
}

export async function publishSchedule(
  client: Pick<Client, "rpc">,
  input: { raidEventId: string; versions: Record<string, number> },
): Promise<ScheduleMutationResult<{ published: boolean }>> {
  const { data, error } = await client.rpc("publish_schedule", {
    p_raid_event_id: input.raidEventId,
    p_expected_versions: input.versions as unknown as Json,
  });
  return error ? mutationError(error) : { status: "success", data: { published: data } };
}

export function waveToSnapshot(wave: ScheduledWave): SnapshotSlot[] {
  return (Object.keys(wave.teams) as TeamColor[]).flatMap((teamColor) =>
    wave.teams[teamColor].slots.map((slot, index) => ({
      team_color: teamColor,
      slot_index: index + 1,
      slot_role: slot.role,
      character_id: slot.character?.id ?? null,
      game_account_id: slot.character?.accountId ?? null,
      profile_id: slot.character?.profileId ?? null,
      is_locked: slot.locked ?? false,
    })),
  );
}
